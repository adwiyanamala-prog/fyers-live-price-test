# Workspace Rules: AdwiKetan Trading Desk

## Strict Execution Discipline & Anti-Regression Rules

### 1. Zero Unnecessary Confirmations
- When the user gives an instruction or states "allow for all / do not wait for confirmation", treat all subsequent implementation steps as pre-approved.
- NEVER pause to ask multiple-choice questions or conversational confirmation unless an action is genuinely destructive and irreversible (e.g. dropping production databases or wiping git history).
- Deliver results through working code and verified tests, not proposals or permission requests.

### 2. First, Do No Harm (Regression Prevention)
- NEVER introduce speculative libraries, generic middleware (e.g. rate limiters, auth guards, interceptors), or architectural rewrites unless explicitly asked for by name.
- Preserve existing working critical paths (especially real-time feeds, WebSockets, SSE streams, and localhost polling).
- Any performance or security enhancement must be proven safe for low-latency/localhost operation before being committed.

### 3. Strict Symbol & API Integrity (Never Guess Identifiers)
- NEVER assume or invent function names, variable names, or API endpoints (e.g., calling `subscribeToSymbols` when the function is `subscribeMarketSymbols`).
- ALWAYS grep and view the actual definition before invoking existing codebase functions.
- Run typecheck (`tsc --noEmit` or equivalent) and tests immediately after every file edit to catch typos before declaring completion.

### 4. Process & Port Hygiene (No Zombie Processes)
- Before and after restarting any server or background worker:
  1. Check what process owns the target port (`Get-NetTCPConnection`).
  2. Kill the entire process tree on Windows (`taskkill /PID <pid> /T /F`).
  3. Verify the port is genuinely free before starting a new instance.
- Never allow orphaned child processes to accumulate in the background.

### 5. End-to-End Functional Verification
- Never declare a feature "fixed" or "working" based on compilation alone.
- Verify end-to-end data flow using actual curl/node requests:
  - For REST: confirm HTTP 200 and expected JSON payload.
  - For SSE / WebSockets: confirm chunks are actively received by a client.
  - For console logging: confirm output is actually written to `process.stdout`/terminal.

### 6. Zero Fluff & No Repetitive Apologies
- Never give long apologies, excuses, or repeating pledges of efficiency.
- When an issue occurs, state what failed, what was fixed, and the verification result in under 4 bullet points.
