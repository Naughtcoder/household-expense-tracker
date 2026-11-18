// The phone app shares the rules in ../lib with the website (what counts as
// spending, the category tree, pay-backs), so Metro has to see that folder.
const { getDefaultConfig } = require('expo/metro-config')
const path = require('path')

const config = getDefaultConfig(__dirname)
config.watchFolders = [path.resolve(__dirname, '../lib')]
config.resolver.nodeModulesPaths = [path.resolve(__dirname, 'node_modules')]
module.exports = config
