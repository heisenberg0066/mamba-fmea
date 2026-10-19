## Mamba FMEA v0.1.0

This is the first release. It is an offline Windows x64 app for FMEA plus pipe hydraulics.

**Downloads**
* `MambaFMEA-Setup-0.1.0-x64.exe` installs for the current user.
* `MambaFMEA-Portable-0.1.0-x64.exe` runs without installing.
* `MambaFMEA-0.1.0-win-x64.zip` contains the unpacked app.

**FMEA**
* AIAG‑VDA 7‑step DFMEA, PFMEA and FMEA‑MSR.
* Structure, function and failure trees with drag‑drop; failure‑chain editor.
* Action Priority (H/M/L), with classic RPN as an option. Rating tables use the app's own wording.
* Form view synced with the trees.
* DFMEA→PFMEA linking, process flow diagram and control plan.
* Library and templates; revisions with diff.
* Dashboard; PDF reports and Excel export/import.

**Hydraulics**
* Network canvas.
* Darcy–Weisbach (Colebrook / Swamee–Jain) and Hazen–Williams.
* GGA and Hardy Cross solvers.
* Pump operating point, system curve, NPSHa vs NPSHr.
* HGL/EGL, flow animation and colour maps.
* Step‑by‑step solution, sweeps, SI/US units, EPANET .inp import/export, PDF report.
* Fluid properties from the shared engsuite core with CoolProp.

**Languages:** English, Svenska, العربية (RTL).

**Validation:** 192/192 checks pass, including textbook cases and the EPANET 2.2 cross‑check. See `docs/VALIDATION.md`.

The builds are unsigned, so Windows SmartScreen will warn on first start: choose *More info → Run anyway*.
