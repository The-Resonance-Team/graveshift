# One config file at boot

Status: supersedes ADR 0011

On 2026-11-22 the owner chose one committed root file, `graveshift.config.yaml`, as the config source of truth. The file has four blocks: `boot`, `agents`, `policy` and `fix`. The merged schema nests the strict Agent schema and the policy schema. The service reads and validates the one file at boot. A bad file stops boot. The old inputs `GRAVESHIFT_AUTO_FIX`, `AGENTS_PATH` and `POLICY_PATH` are gone. The example files `agents.example.yaml` and `policy.example.yaml` are gone.

The `fix.enabled` flag is read from the file at boot. The committed default is false, so auto-fix stays off until a person reviews and changes it. This keeps the fail-closed default of the old `GRAVESHIFT_AUTO_FIX` input. Triage starts auto-fix only when the flag is true. Fix now stays available in every case. One `fix.promptTemplate` in the file owns the patch prompt. The Exorcist is a named Agent in the same file. No role or persona is hard-coded in the patch package.

The file holds no secret value. Each Agent names its key with `apiKeyEnv`. The GitHub App identity names its secrets with `appIdEnv` and `privateKeyEnv`. `DATABASE_URL` and the MCP token stay in the environment. The service builds the real model gateway and the real GitHub client from the validated file. The model path stays behind `packages/gateway` under ADR 0007. That path deviates from `rules/libraries.md` #16 (`@nestjs/ai`); the deviation was reported at https://github.com/The-Resonance-Team/skills/issues/17.

The actuator loads the one file too. A bad Agent or fix block therefore stops the actuator as well, and the actuator depends on `@graveshift/config`, which imports the Agent schemas. The owner accepted this coupling when the merged config replaced the split loaders.

ADR 0011 said the API had no config write endpoint. The owner now plans one authenticated write route. The correct rule is "no unauthenticated write endpoint". Ticket #73 carries the updated wording. The read-only view of validated config stays.

Rejected alternative: three separate input sources (env switch, agent file, policy file). That shape let the three values disagree at boot and made the fix path depend on which file a process happened to read.

Trade-off: one file makes a config change a reviewed commit and a restart. The merged schema is larger than either old schema. In exchange, every consumer sees the same validated config value.
