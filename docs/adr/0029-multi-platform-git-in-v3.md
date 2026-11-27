# Multi-platform git in v3

Status: accepted

On 2026-11-23 the owner decided the scope of git platforms in v3. The v2 fix path stays GitHub-only. v3 adds other git-compatible platforms through adapters.

The current fix path uses `policy.github.repos`, GitHub REST calls and `GRAVESHIFT_GITHUB_INSTALLATIONS`. In v3 the title is read from git, which is platform-neutral. [ADR 0008](0008-fix-paths-and-safety.md) still owns the safety rule: the fix result is a draft pull request only, with no merge and no runtime action.

Every adapter must create a draft pull request or a draft merge request. An adapter must never merge it. The draft-only rule holds on every platform.

Trade-off: the adapter surface and credential handling grow. In return, v3 supports git-compatible platforms without changing the safety rule.

Upgrade trigger: the owner asks for GitLab, Bitbucket or self-hosted git support.
