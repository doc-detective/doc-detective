# Claude Code Configuration

This file is a pointer for Claude Code and similar AI assistants.

## Primary Documentation

See **[AGENTS.md](./AGENTS.md)** for complete project guidelines, architecture, and development workflows.

## Quick Reference

### Testing (CRITICAL)

**All code changes require TDD:**
1. Write tests first
2. Verify tests fail
3. Write implementation
4. Verify tests pass
5. Check coverage: `npm run test:coverage:ratchet`

**Coverage must never decrease.**

### Available Commands

```bash
npm test                     # Run tests
npm run test:coverage        # Tests + coverage report
npm run test:coverage:ratchet # Verify coverage baseline
npm run build               # Build schemas
```

### Key Files

| Purpose | Location |
|---------|----------|
| Project guidelines | `AGENTS.md` |
| TDD/Coverage skill | `.claude/skills/tdd-coverage/SKILL.md` |
| Coverage config | `.c8rc.json` |
| Coverage baseline | `coverage-thresholds.json` |
