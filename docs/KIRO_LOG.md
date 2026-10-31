# How Stackyard is built with Kiro (running log)

Kept from day one for the Kiroween write-up.

## 30 Oct 2026: steering first
- Tool: Kiro CLI (`kiro-cli chat`), signed in with Google.
- Before any code, we asked Kiro to write the project steering from a one-paragraph brief: `product.md`, `tech.md`, `stack-format.md`, `audience.md` in `.kiro/steering/`.
- The stack format and its seven invariants (unique ids, valid goto targets, exactly one end card, one correct answer per quiz card, canvas bounds, non-empty title, at least one playable card) become the contract for the generator, the editor, the exporter and the property-based tests.
- First attempt drafted the files but did not write them (file tools were not trusted for the session); resumed the same session with write access and it saved what it had drafted.
