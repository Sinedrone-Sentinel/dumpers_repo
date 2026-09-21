package singleinstance

// MutexName is the Windows named mutex shared with dumper.py.
// Two DumperApps.exe, two scripts, or exe+script all take this same name.
const MutexName = `Local\DumpersRepo.BPDumper`
