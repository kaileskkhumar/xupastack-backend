# Contributing to XupaStack

Thanks for helping keep Supabase accessible for everyone.

## Ways to Contribute

- **Bug reports** — open an issue with steps to reproduce
- **ISP fixes** — if a new ISP is blocking Supabase, open an issue with details
- **Code** — bug fixes, performance improvements, new stack snippets
- **Docs** — corrections or improvements to README and inline docs

## Pull Request Process

1. Fork the repo and create a branch from `main`
2. Make your changes
3. Run `pnpm test` — all tests must pass
4. Open a PR with a clear description of what changed and why

## Local Setup

```bash
pnpm install
cd apps/api && wrangler dev        # API on localhost:8787
cd apps/gateway-managed && wrangler dev  # Gateway on localhost:8788
pnpm test                          # Run all tests
```

## Code Style

- TypeScript everywhere
- No `any` types without a comment explaining why
- Keep functions small and focused

## License

By contributing, you agree your code will be licensed under [AGPL-3.0](LICENSE).
