package main

import _ "embed"

//go:embed lookup.json
var embeddedLookup []byte

//go:embed version.txt
var embeddedVersion string

//go:embed mingame.txt
var embeddedMinGame string
