## Foundry

**Foundry is a blazing fast, portable and modular toolkit for Ethereum application development written in Rust.**

Foundry consists of:

-   **Forge**: Ethereum testing framework (like Truffle, Hardhat and DappTools).
-   **Cast**: Swiss army knife for interacting with EVM smart contracts, sending transactions and getting chain data.
-   **Anvil**: Local Ethereum node, akin to Ganache, Hardhat Network.
-   **Chisel**: Fast, utilitarian, and verbose solidity REPL.

## Documentation

https://book.getfoundry.sh/

## Usage

### Build

```shell
$ forge build
```

### Test

```shell
$ forge test
```

### Format

```shell
$ forge fmt
```

### Gas Snapshots

```shell
$ forge snapshot
```

### Anvil

```shell
$ anvil
```

### Tunnel Anvil with ngrok

To make your local Anvil network accessible to external services (like Supabase Edge Functions), use the ngrok tunnel script:

```shell
$ ./tunnel-anvil.sh
```

This will:
1. Check if Anvil is running on port 8545
2. Start an ngrok tunnel to expose Anvil publicly
3. Display the public URL you can use in your environment variables

**Update Supabase secrets with the ngrok URL:**
```shell
$ supabase secrets set RPC_URL_LOCAL=https://xxxxx.ngrok.io
```

**Note:** You need to have ngrok installed. Get it from https://ngrok.com/download or install via homebrew:
```shell
$ brew install ngrok/ngrok/ngrok
```

### Deploy

```shell
$ forge script script/Counter.s.sol:CounterScript --rpc-url <your_rpc_url> --private-key <your_private_key>
```

### Cast

```shell
$ cast <subcommand>
```

### Help

```shell
$ forge --help
$ anvil --help
$ cast --help
```
