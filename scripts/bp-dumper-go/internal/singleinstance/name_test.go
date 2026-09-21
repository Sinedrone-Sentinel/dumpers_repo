package singleinstance

import "testing"

func TestMutexName(t *testing.T) {
	const want = `Local\DumpersRepo.BPDumper`
	if MutexName != want {
		t.Fatalf("MutexName = %q, want %q", MutexName, want)
	}
}
