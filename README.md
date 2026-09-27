# Equator

A clear line across Robinhood Chain. Equator is a project for digital equities and options markets, built for Robinhood Chain. This repository holds the website served at **equator.digital**.

> Status: pre-launch. Anything not listed as stated below has not been announced.

## Network

| Field | Value |
| --- | --- |
| Chain | Robinhood Chain |
| Chain ID | 4663 (`0x1237`) |
| RPC | `https://rpc.mainnet.chain.robinhood.com` |

The site reads live chain readings (block, block age, gas price, base fee, gas used) from that RPC every 15 seconds, and chain TVL from DefiLlama every 10 minutes. When a reading is unavailable it shows `—`. Nothing is estimated.

## Contract address

| Field | State |
| --- | --- |
| Contract address | Not yet announced |

The address will be published here and on the site at the same time. Until then, treat any address presented as Equator's as unverified.

## Social

| Channel | State |
| --- | --- |
| X | Not yet published |
| GitHub organisation | Not yet published |

Links are added only once they are stated.

## Documents

- [Whitepaper](docs/whitepaper.md): what the project is and how facts are published
- [Tokenomics](docs/tokenomics.md): token structure, with every figure marked as stated or pending
- [Roadmap](docs/roadmap.md): development phases
- [Contributing](.github/CONTRIBUTING.md)

## Site

The site is static. Source lives in `src/`, and the deployable output is `dist/`.

```bash
npm run build
npm run gates
```

There is no wallet connection and no signing anywhere in the site.

## License

[MIT](LICENSE)
