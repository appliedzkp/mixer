# MicroMix: A noncustodial Ethereum mixer

<a href="https://micromix.app">
    <img src="/docs/img/logo.png" />
</a>

This is the monorepo for all code and documentation for a noncustodial Ethereum
mixer. Try it at [micromix.app](https://micromix.app).

Join the [Telegram group](https://t.me/joinchat/A5mVoBRl-b6SD8aoAUVvFw) to discuss.

A mixer moves ETH or ERC20 tokens from one address to another in a way that
nobody except the sender can know for sure that these addresses are linked.
This mixer lets a user deposit fixed amounts of ETH into a contract, and when
the pool is large enough, anonymously submit zero-knowledge proofs which show
that the submitter had previously made a deposit, thus authorising the contract
to release funds to the recipient.

As a transaction relayer pays the gas of this transaction, there is no certain
on-chain connection between the sender and recipient. Although this relayer is
centralised, the mixer is noncustodial and no third party can exit with users'
funds.

A technical specification of the mixer is
[here](https://hackmd.io/qlKORn5MSOes1WtsEznu_g)
Implementation feature are listed
[here](https://hackmd.io/-n4owIZBR2iwx_kem7Pwkg)
.

This mixer is highly experimental and not yet audited. Do not use it to mix
real funds yet. It have been tested successfully on Ganache, Kovan ETH, Ropsten ETH, Arbitrum ETH. Get Kovan ETH from a faucet
[here](https://faucet.kovan.network/) or
[here](https://gitter.im/kovan-testnet/faucet).

## Supported features

The current version of this mixer is a simple MVP for desktop Chrome, Brave, or
Firefox. You should also have [MetaMask](https://metamask.io/) installed, and
some Kovan ETH. By default you need at least 0.11 KETH to mix 0.1 ETH, and 20 Kovan DAI
and 0.01 ETH to mix Kovan DAI. You can generate Kovan DAI using MakerDAO's CDP
creation tool [here](https://cdp.makerdao.com).

It has the following features:

1. A user interface which allows:

    - One deposit per day.

    - One-click withdrawal once UTC midnight has passed.

    - Immediate self-withdrawals in case the user wants their funds back at the
      cost of privacy.

    - Immediate withdraw requests if the user wishes the operator to mix the
      funds immediately, which also comes at the cost of some privacy.

2. A backend server with one JSON-RPC 2.0 endpoint (deprecated and
  replaced with the generic Surrogeth agent), `mixer_mix()`, which:

    - Accepts, verifies, and submits a zk-SNARK proof (generated in the user's
      browser) to the mixer contract.

3. Ethereum contracts:

    - The
      [Semaphore](https://github.com/kobigurk/semaphore/) zero-knowledge
      signalling system as a base layer.

    - A Mixer contract with functions which

        - Accepts ETH or ERC20 token deposits.

        - Accepts mix requests. Each request comprises of a zk-SNARK proof that
          a deposit had been made in the past and has not already been claimed.
          If the proof is valid, it transfers funds to the recipient and takes an
          operator's fee.

        - Allows the operator to withdraw all accurred fees.

    - A MixerRegistry contract that can deploy Mixer and Semaphore contract

    - A ForwarderRegistryERC20 contract that is used by the Surrogeth deamon to register globaly and to get statistic on usage

    - Gas costs after the Istanbul network upgrade is currently 1.2 million per
      deposit and 378k to 420k per withdrawal. The gas cost for each withdrawal
      (before Istanbul) is 886k.



## Local development and testing

These instructions have been tested with Debian 4.19 and Node v15 and v16


### Local development

#### download sources

Clone this repository and its `semaphore`, `libsemaphore` and `surrogeth` submodule:

```bash
git clone https://github.com/jrastit/mixer.git
cd mixer
git submodule update --init
```

#### get the already build circuit from semaphore

Download the circuit, keys, and verifier contract. Doing this instead of
generating your own keys will save you about 20 minutes. Note that these are
not for production use as there is no guarantee that the toxic waste was
discarded.

```bash
./scripts/downloadSnarks.sh
```

#### generate your circuit for semaphore (optional) (not needed if you have done the previous step)


#### install dependencies

Install dependencies for the libsemaphore submodule:
```bash
cd libsemaphore && \
npm i
# if you are still in libsemaphore
cd ../
```

Install dependencies for the Surrogeth submodule:
```bash
cd surrogeth/client && \
npm i
# if you are still in surrogeth
cd ../../

cd surrogeth/surrogethd && \
npm i
# if you are still in surrogeth
cd ../../
```

If you want to use other network than ganache
Create a file named `kovanPrivateKeys.json` (or a name of your choice if you
modify the config) in the mixer/key directory or for more security
in a location outside this repository with a private key which will serve as
the operator's hot wallet.

You can copy it from `/mixer/key/ganachePrivateKey.json`
Don't use any of this key in production
Only the first 3 values are used for testing

```json
[
    "0xaa3680d5d48a8283413f7a108367c7299ca73f553735860a87b08f39395618b7",
    "0x0f62d96d6675f32685bbdb8ac13cda7c23436f63efbb9d07700d8669ff12b7c4",
    "0x8d5366123cb560bb606379f90a0bfd4769eecc0557f1b362dcae9012b548b1e5"
]
```

Copy `config/config.example.yaml` to `config/local-dev.yaml` to  and modify
it as such:

- Change `key/kovanPrivateKeys.json` to the absolute path to the
  `kovanPrivateKeys.json` file you just created if not in the contracts directory.

- If you want to test only on ganache, put disalbe : true on all other network (kovan, ... )
Or if you want to run the test, in config : ln -s local-test.yaml local-dev.yaml


#### Build the source code:

```bash
npm i && \
npm run bootstrap && \
npm run build
```

#### Run ganache for local test
Run ganache with screen
```bash
# Assuming you are in mixer/
npm run screen-ganache
````

Or run it in a new terminal to see the output
(let it run and open a new terminal)
```bash
# Assuming you are in mixer/
npm run ganache
```

Clean contract deployed cache (if already deployed before with ganache):
```bash
# Assuming you are in mixer/
npm run clean-cache
```

#### Deploy the contracts if needed

Deploy the contracts:

```bash
# Assuming you are in mixer/
npm run deploy
```

#### Surrogeth

Config surrogeth from deployed contracts

Autoconfig surrogeth
```bash
# Assuming you are in mixer/
npm run surrogeth-info
```

Run the `surrogeth` with screen
```bash
# Assuming you are in mixer/
npm run screen-surrogeth
```

Or in another terminal, run surrogeth:

```bash
# Assuming you are in mixer/
npm run surrogeth
```

#### Run semaphore for enabling circuit download

Run `semaphore` server with screen
```bash
# Assuming you are in mixer/
npm run screen-semaphore
```

Or in annother terminal launch a HTTP server to serve the zk-SNARK content:
```bash
# Assuming you are in mixer/
npm run semaphore
```

#### Run the frontend

You can now run the frontend at http://localhost:1234.
Using screen
```bash
# Assuming you are in mixer/
npm run screen-frontend
```
in the terminal
```bash
# Assuming you are in mixer/
npm run frontend
```

To check the status of screen : screen -ls
To check a running screen : screen -r MixerFrontend (and then to quit without
killing it Ctrl + a / Ctrl + d)

To automatically compile the TypeScript source code whenever you change it,
first make sure that you have `npm run watch` running in a terminal. For
instance, while you edit `backend/ts/index.ts`, have a terminal open at
`backend/` and then run `npm run watch`.

If you use a terminal multiplexer like `tmux`, your screen might now look like this:

<img src="/docs/img/dev_screens.png" />

Clockwise from top right:

1. Ganache (`npm run ganache`)
2. Deployed contracts (`npm run deploy`)
3. Frontend (`npm run frontend`)
4. Semaphore (`npm run semaphore`)
5. Surrogeth (`npm run surrogeth`)

### Backend (Deprecated)

#### requirement
- [`etcd`](https://github.com/etcd-io/etcd) v3.3.13
    - The backend server requires an `etcd` server to lock the account nonce of
      its hot wallet.

#### Enable it in the configuration `config/*.yaml`
```
frontend:
  enableBackend: true
````

#### Run backend

Run `etcd` with screen

```bash
screen -S etcd -d -m etcd
```

Or in another terminal, run `etcd`:

```bash
etcd
```

Run the `backend` with screen
```bash
# Assuming you are in mixer/
npm run screen-backend
```

Or in another terminal, run the backend:

```bash
# Assuming you are in mixer/
npm run backend
```

## Testing

### Unit tests

#### Contracts

In the `mixer/contracts/` directory (after starting ganache and deployed the contracts):

1. Modify the config file if needed in `config/local-test.yaml` you can set `disable:true` to disable some networks in the test
2. Run `npm run screen-ganache` if you are testing the ganache network
3. Run `npm run clean-cache` to reset contract ganache cache
4. Run `npm run deploy` to deploy contract
5. Run `npm run surrogeth-info` to configure surrogeth for testing
6. Run `npm run screen-surrogeth` to run surrogeth agent for testing
7. Run `npm run test` to run the test suite

It will run for all enabled network in config to run only specific network and token
add `-- --network=ganache --token=eth`

#### Backend

In the `mixer/backend/` directory (after starting ganache and deployed the contracts):

2. Run `npm run test`

## Deployment

<!--### Ethereum contracts-->

<!--First, copy `config/local-dev.yaml` to `config/local-prod.yaml` and modify it as such:-->

<!--- Change `chain.url` to an Ethereum node of a network of your choice, e.g.-->
  <!--`"https://kovan.infura.io/v3/<api_key>`-->
<!--- Change `chain.chainId` to the corresponding chain ID. e.g. `42` for Kovan.-->

### Docker containers

Check docker configuration file in `config/docker.yaml` and `docker/docker-compose.yml`

To build the image Run:

`npm run docker-build`

To run the image that will deploy the frontent on port 1235 by default `http://localhost:1235/`:
`npm run docker-start`

To unload the image:
`npm run docker-stop`

This will produce the following images and containers (edited for brevity):

```
REPOSITORY              TAG                 SIZE
docker_mixer-frontend   latest              37.1MB
mixer-base              latest              1.44GB
mixer-build             latest              2.32GB
nginx                   1.17.1-alpine       20.6MB
node                    16-buster           20.6MB

CONTAINER ID        IMAGE                   COMMAND                  PORTS                          NAMES
............        docker_mixer-frontend   "/bin/sh -c 'nginx -…"   80/tcp, 0.0.0.0:1235->8001/tcp   mixer-frontend
```

In contrast, the local instances run via `npm run watch` in
`frontend/` and `npm run server` in `backend` respectively use
[`config/local-dev.yaml`](config/local-dev.yaml).

<!--## Full documentation-->

<!--**TODO**-->

### Directory structure

- `frontend/`: source code for the UI
- `backend/`: source code for the backend deprecated and replaced with surrogeth
- `contracts/`: source code for mixer contracts and tests
- `semaphore/`: a submodule for the [Semaphore code](https://github.com/weijiekoh/semaphore)
- `libsemaphore/` : a submodule for the libsemaphore
- `surrogeth/` : a submodule for the Surrogeth agent

### Frontend

See the frontend documentation [here](./frontend).

## Contributing pull requests

Each PR should contain a clear description of the feature it adds or problem it
solves (the **why**), and walk the user through a summary of **how** it solves
it.

Each PR should also add to the unit and/or integration tests as appropriate.

<!--## Governance and project management-->

<!--**TODO**-->

<!--## Code of conduct and reporting-->

<!--**TODO**-->

## Generate your circuit for semaphore (optional)

##### Install Node 11.14.0 for local user to be able to run semaphore

Add at the end of ~/.profile or run it in your terminal to setup the path

```bash
export PATH=~/.npm-global/bin:$PATH
export N_PREFIX=$HOME/.npm-global
```

Activate change in profile:
```bash
. ~/.profile
```

Install npm (need any node version) you may use the one already present on the system.
```bash
wget https://nodejs.org/dist/v14.15.4/node-v14.15.4-linux-x64.tar.xz
tar -xf node-v14.15.4-linux-x64.tar.xz
export PATH=$PATH:.
cd node-v14.15.4-linux-x64/bin
npm config set prefix '~/.npm-global'
```

Install n (Package manager for node) and node x.x.x
```bash
npm i -g n
n x.x.x
```

Clean not needed version
```bash
cd ~/
rm -rf node-v14.15.4-linux-x64.tar.xz  node-v14.15.4-linux-x64
```

Verify
```bash
npm -v
#x.x.x
```

```bash
node -v
#v11.14.0
```

##### Generate the circuit

to generate the circuit
in a teminal with node 11.14.0
```bash
#Check the version of node
node -v
#v11.14.0
cd semaphore/semaphorejs && \
npm i && \
cd scripts && ./build_snarks.sh
# if you are still in semaphore scripts
cd ../../../
```
