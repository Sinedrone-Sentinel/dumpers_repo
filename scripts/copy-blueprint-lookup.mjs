#!/usr/bin/env node
/**
 * Copy canonical blueprint-name-lookup.json into client/server build targets.
 */
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'
import { copyBlueprintLookupTargets } from './lib/blueprintNameLookup.mjs'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
copyBlueprintLookupTargets(root)
console.log('Copied blueprint-name-lookup.json → 2 targets')
