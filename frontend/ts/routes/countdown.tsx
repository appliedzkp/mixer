import React, { Component, useState } from 'react'
import ReactDOM from 'react-dom'
import { useTimer } from 'react-timer-hook'
import * as ethers from 'ethers'
import { useWeb3Context } from 'web3-react'
import { Redirect } from 'react-router-dom'
import { getMixerContract } from '../web3/mixer'
import { genMixParams, sleep } from 'mixer-utils'
import { 
    genSignedMsg,
    genPubKey,
    genTree,
    genWitness,
    genCircuit,
    genPathElementsAndIndex,
    genIdentityCommitment,
    genSignalAndSignalHash,
    genPublicSignals,
    verifySignature,
    unstringifyBigInts,
    genProof,
    verifyProof,
} from 'mixer-crypto'

import {
    getItems,
    getNumItems,
    updateWithdrawTxHash,
    getNumUnwithdrawn,
    getFirstUnwithdrawn,
} from '../storage'

import { ErrorCodes } from '../errors'

import {
    mixAmtEth,
    operatorFeeEth,
    feeAmtWei,
} from '../utils/ethAmts'

const config = require('../exported_config')
const deployedAddresses = config.chain.deployedAddresses
const broadcasterAddress = config.backend.broadcasterAddress

const blockExplorerTxPrefix = config.frontend.blockExplorerTxPrefix
const endsAtMidnight = config.frontend.countdown.endsAtUtcMidnight
const endsAfterSecs = config.frontend.countdown.endsAfterSecs

const months = [
    'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
]

export default () => {
    if (getNumUnwithdrawn() === 0) {
        return <Redirect to='/' />
    }

    const [txHash, setTxHash] = useState('')
    const [firstLoadTime, setFirstLoadTime] = useState(new Date())
    const [withdrawStarted, setWithdrawStarted] = useState(false)
    const [countdownDone, setCountdownDone] = useState(false)
    const [proofGenProgress, setProofGenProgress] = useState('')
    const [showAdvanced, setShowAdvanced] = useState(false)
    const [withdrawBtnClicked, setWithdrawBtnClicked] = useState(false)
    const [errorMsg, setErrorMsg] = useState('')

    const progress = (line: string) => {
        setProofGenProgress(line)
    }

    const identityStored = getFirstUnwithdrawn()
    const recipientAddress = identityStored.recipientAddress

    const context = useWeb3Context()

    const withdraw = async (context) => {
        if (!context.connector) {
            return
        }
        const provider = new ethers.providers.Web3Provider(
            await context.connector.getProvider(config.chain.chainId),
        )

        const recipientBalanceBefore = await provider.getBalance(recipientAddress)
        console.log('The recipient has', ethers.utils.formatEther(recipientBalanceBefore), 'ETH')

        try {
            const mixerContract = await getMixerContract(context)

            const externalNullifier = mixerContract.address

            progress('Downloading leaves...')

            const leaves = await mixerContract.getLeaves()

            const tree = await genTree(leaves)

            const pubKey = genPubKey(identityStored.privKey)

            const identityCommitment = genIdentityCommitment(
                identityStored.identityNullifier,
                pubKey,
            )

            const { identityPathElements, identityPathIndex } = await genPathElementsAndIndex(
                tree,
                identityCommitment,
            )

            const leafIndex = await tree.element_index(identityCommitment)
            const identityPath = await tree.path(leafIndex)

            const { signalHash, signal } = genSignalAndSignalHash(
                recipientAddress, broadcasterAddress, feeAmtWei,
            )

            const { signature, msg } = genSignedMsg(
                identityStored.privKey,
                externalNullifier,
                signalHash, 
            )

            const validSig = verifySignature(msg, signature, pubKey)
            if (!validSig) {
                throw {
                    code: ErrorCodes.INVALID_SIG,
                }
            }

            progress('Downloading circuit...')
            const cirDef = await (await fetch(config.frontend.snarks.paths.circuit)).json()
            const circuit = genCircuit(cirDef)

            let w
            try {
                w = genWitness(
                    circuit,
                    pubKey,
                    signature,
                    signalHash,
                    externalNullifier,
                    identityStored.identityNullifier,
                    identityPathElements,
                    identityPathIndex,
                )
            } catch (err) {
                console.error(err)
                throw {
                    code: ErrorCodes.WITNESS_GEN_ERROR,
                }
            }

            if (!circuit.checkWitness(w)) {
                throw {
                    code: ErrorCodes.INVALID_WITNESS,
                }
            }

            progress('Downloading proving key...')
            const provingKey = new Uint8Array(
                await (await fetch(config.frontend.snarks.paths.provingKey)).arrayBuffer()
            )

            progress('Downloading verification key...')
            const verifyingKey = unstringifyBigInts(
                await (await fetch(config.frontend.snarks.paths.verificationKey)).json()
            )

            progress('Generating proof...')
            const proof = await genProof(w, provingKey.buffer)

            const publicSignals = genPublicSignals(w, circuit)

            const isVerified = verifyProof(verifyingKey, proof, publicSignals)

            if (!isVerified) {
                throw {
                    code: ErrorCodes.INVALID_PROOF,
                }
            }

            const params = genMixParams(
                signal,
                proof,
                recipientAddress,
                BigInt(feeAmtWei.toString()),
                publicSignals,
            )

            const request = {
                jsonrpc: '2.0',
                id: (new Date()).getTime(),
                method: 'mixer_mix',
                params,
            }

            progress('Sending JSON-RPC call to the relayer...')
            console.log(request)

            const response = await fetch(
                '/api',
                {
                    method: 'POST',
                    body: JSON.stringify(request),
                    headers: {
                        'Content-Type': 'application/json',
                    }
                },
            )

            const responseJson = await response.json()
            if (responseJson.result) {
                progress('')
                setTxHash(responseJson.result.txHash)
                console.log(responseJson.result.txHash)
                updateWithdrawTxHash(identityStored, responseJson.result.txHash)

                await sleep(4000)

                const recipientBalanceAfter = await provider.getBalance(recipientAddress)
                console.log('The recipient now has', ethers.utils.formatEther(recipientBalanceAfter), 'ETH')
            } else if (responseJson.error.data.name === 'BACKEND_MIX_PROOF_PRE_BROADCAST_INVALID') {
                throw {
                    code: ErrorCodes.PRE_BROADCAST_CHECK_FAILED
                }
            }
        } catch (err) {
            console.error(err)

            if (
                err.code === ethers.errors.UNSUPPORTED_OPERATION &&
                err.reason === 'contract not deployed'
            ) {
                setErrorMsg(`The mixer contract was not deployed to the expected address ${deployedAddresses.Mixer}`)
            } else if (err.code === ErrorCodes.WITNESS_GEN_ERROR) {
                setErrorMsg('Could not generate witness.')
            } else if (err.code === ErrorCodes.INVALID_WITNESS) {
                setErrorMsg('Invalid witness.')
            } else if (err.code === ErrorCodes.INVALID_PROOF) {
                setErrorMsg('Invalid proof.')
            } else if (err.code === ErrorCodes.INVALID_SIG) {
                setErrorMsg('Invalid signature.')
            } else if (err.code === ErrorCodes.TX_FAILED) {
                setErrorMsg('The transaction failed.')
            } else if (err.code === ErrorCodes.PRE_BROADCAST_CHECK_FAILED) {
                setErrorMsg('The pre-broadcast check failed')
            }

        }
    }
    
    let expiryTimestamp = new Date(identityStored.timestamp)
    expiryTimestamp.setUTCHours(0, 0, 0, 0)
    expiryTimestamp.setDate(expiryTimestamp.getDate() + 1)


    // Whether the current time is greater than the expiry timestamp (i.e.
    // UTC midnight 
    const midnightOver = firstLoadTime > expiryTimestamp

    // Dev only
    if (!endsAtMidnight && !midnightOver) {
        expiryTimestamp = new Date()
        expiryTimestamp.setSeconds(
            expiryTimestamp.getSeconds() + endsAfterSecs
        )
    }

    const timeStr = `${expiryTimestamp.getDate()} ${months[expiryTimestamp.getMonth()]} ` +
        `${expiryTimestamp.getFullYear()}, ${expiryTimestamp.toLocaleTimeString()}`

    const timer = useTimer({
        expiryTimestamp,
        onExpire: () => {
            if (!countdownDone) {
                setCountdownDone(true)
            }
        }
    })

    if (!withdrawStarted &&
        countdownDone &&
        context &&
        !midnightOver &&
        timer.days + timer.hours + timer.minutes + timer.seconds === 0
    ) {
        setWithdrawStarted(true)
        withdraw(context)
    }

    const withdrawBtn = (
        <span
            onClick={() => {
                setWithdrawBtnClicked(true)
                if (showAdvanced) {
                    setShowAdvanced(false)
                }
                if (!withdrawStarted) {
                    setWithdrawStarted(true)
                    withdraw(context)
                }
            }}
            className='button is-warning'>
            Mix {mixAmtEth} ETH now
        </span>
    )

    return (
        <div className='section first-section'>
            <div className='columns has-text-centered'>
                <div className='column is-8 is-offset-2'>
                    <div className='section'>
                        <h2 className='subtitle'>
                            The address:
                            <br />
                            <br />
                            <pre>
                                {recipientAddress} 
                            </pre>
                            <br />
                            can receive {mixAmtEth - operatorFeeEth} ETH 
                            { countdownDone || midnightOver || withdrawBtnClicked ?
                                <span>
                                    { (txHash.length === 0 && midnightOver) ?
                                        <span>.</span>
                                        :
                                        <span>
                                            {' '} soon.
                                        </span>
                                    }
                                  { proofGenProgress.length > 0 && 
                                      <div className="has-text-left">
                                          <br />
                                          <pre>
                                              {proofGenProgress}
                                          </pre>
                                      </div>
                                  }
                                </span>
                                :
                                <span>
                                    {' '} shortly after { timeStr } local time.
                                </span>
                            }
                        </h2>

                        { context.error == null && txHash.length === 0 && midnightOver && !withdrawStarted &&
                            withdrawBtn
                        }

                        { (context.error != null && context.error.code === 'UNSUPPORTED_NETWORK') &&
                            <p>
                                To continue, please connect to the correct Ethereum network.
                            </p>
                        }

                        { txHash.length > 0 &&
                            <article className="message is-success">
                                <div className="message-body">
                                    Mix successful. <a
                                        href={blockExplorerTxPrefix + txHash}
                                        target="_blank">View on Etherscan.
                                    </a>
                                </div>
                            </article>
                        }

                    </div>
                </div>

            </div>

            { errorMsg.length > 0 &&
                <article className="message is-danger">
                    <div className="message-body">
                        {'Error: ' + errorMsg}
                    </div>
                </article>
            }


            { !(txHash.length === 0 && midnightOver) &&
                <div className='columns'>
                    <div className='column is-6 is-offset-3'>
                        <p>
                            To enjoy the most anonymity, leave your deposit
                            untouched for as long as possible.
                        </p>
                        <br />
                        <p>
                            To let this page automatically mix your funds at an
                            optimal time, leave this page open till after
                            midnight UTC. For example, if you deposit your
                            funds at 3pm UTC on 1 Jan, this page will wait for
                            9 hours to mix the funds. If you close this page,
                            you can reopen it any time, and withdraw it at a
                            click of a button, even after midnight UTC.
                        </p>
                    </div>

                </div>
            }

            <br />

            { !(txHash.length === 0 && midnightOver && !withdrawStarted) &&
                !withdrawBtnClicked &&
                !withdrawStarted &&
                <div>
                    <div className="columns has-text-centered">
                        <div className='column is-12'>
                                <h2 className='subtitle'>
                                    {timer.hours}h {timer.minutes}m {timer.seconds}s left
                                </h2>
                            <h2 className='subtitle'>
                                Please keep this tab open.
                            </h2>
                        </div>
                    </div>

                    <div className="columns has-text-centered">
                        <div className='column is-12'>
                            <p className='subtitle advanced' onClick={
                                () => {
                                    setShowAdvanced(!showAdvanced)
                                }
                            }>
                                Advanced options 
                                <span 
                                    className={
                                        showAdvanced ? "chevron-up" : "chevron-down"
                                    }>
                                </span>
                            </p>

                            { showAdvanced &&
                                <article className="message is-info">
                                    <div className="message-body">
                                        <p>
                                            If you'd like, you may request to
                                            mix your funds now. Note that if
                                            you so now, may not have as much
                                            anonymity than if you were to wait
                                            till after midnight UTC or later.
                                        </p>
                                    </div>

                                    {context.error == null && withdrawBtn}

                                    { (context.error != null && context.error.code === 'UNSUPPORTED_NETWORK') &&
                                        <p>
                                            To continue, please connect to the correct Ethereum network.
                                        </p>
                                    }

                                    <br />
                                    <br />
                                </article>
                            }
                        </div>
                    </div>
                </div>
            }
        </div>
    )
}

