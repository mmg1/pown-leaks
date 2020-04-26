exports.yargs = {
    command: 'leaks <location>',
    describe: 'Find leaks',

    builder: (yargs) => {
        yargs.options('header', {
            alias: 'H',
            type: 'string',
            describe: 'Custom header'
        })

        yargs.options('retry', {
            alias: 'r',
            type: 'number',
            default: 5
        })

        yargs.options('timeout', {
            alias: 't',
            type: 'number',
            default: 30000
        })

        yargs.options('task-concurrency', {
            alias: 'C',
            type: 'number',
            default: Infinity
        })

        yargs.options('request-concurrency', {
            alias: 'c',
            type: 'number',
            default: Infinity
        })

        yargs.options('summary', {
            alias: 's',
            type: 'boolean',
            default: false
        })

        yargs.options('json', {
            alias: 'j',
            type: 'boolean',
            default: false
        })

        yargs.options('unique', {
            alias: 'u',
            type: 'boolean',
            default: false
        })

        yargs.options('embed', {
            alias: 'e',
            type: 'boolean',
            default: false
        })

        yargs.options('write', {
            alias: 'w',
            type: 'string',
            default: ''
        })
    },

    handler: async(args) => {
        let { header } = args

        const { retry, timeout, requestConcurrency, taskConcurrency, summary, json, unique, embed, write, location } = args

        const headers = {}

        if (header) {
            if (!Array.isArray(header)) {
                header = [header]
            }

            for (let entry of header) {
                let [name = '', value = ''] = entry.split(':', 1)

                name = name.trim() || entry
                value = value.trim() || ''

                if (headers[name]) {
                    if (!Array.isArray(headers[name])) {
                        headers[name] = [headers[name]]
                    }

                    headers[name].push(value)
                }
                else {
                    headers[name] = value
                }
            }
        }

        const fs = require('fs')
        const { promisify } = require('util')

        const readFileAsync = promisify(fs.readFile)

        let scheduler

        try {
            const { Scheduler } = require('@pown/request/lib/scheduler')

            scheduler = new Scheduler({ maxConcurrent: requestConcurrency })
        }
        catch (e) {
            // pass
        }

        const options = {
            scheduler,
            headers,
            retry,
            timeout
        }

        const fetchRequest = async(location) => {
            if (!scheduler) {
                console.warn('@pown/request not available')

                return ''
            }

            const { responseBody } = await scheduler.request({ ...options, uri: location })

            return responseBody
        }

        const fetchFile = async(location) => {
            const data = await readFileAsync(location)

            return data
        }

        let it

        if (location === true) {
            const process = require('process')
            const readline = require('readline')

            rl = readline.createInterface({
                input: process.stdin
            })

            it = async function*() {
                for await (let line of rl) {
                    yield line
                }
            }
        }
        else {
            it = function*() {
                yield location
            }
        }

        let print = (location, result, text) => {
            const { check, index, find } = result
            const { severity, title, regex } = check

            if (json) {
                const object = { location, severity, title, index, find, regex: regex.toString() }

                if (embed) {
                    object['contents'] = text
                }

                console.log(JSON.stringify(object))
            }
            else {
                if (summary) {
                    console.warn(`title: ${title} severity: ${severity} index: ${index} location: ${location}`)
                }

                console.log(find)
            }
        }

        if (write) {
            print = ((print) => {
                const { createWriteStream } = require('fs')

                const ws = createWriteStream(write)

                return (location, result, text) => {
                    const { check, index, find } = result
                    const { severity, title, regex } = check

                    const object = { location, severity, title, index, find, regex: regex.toString() }

                    if (embed) {
                        object['contents'] = text
                    }

                    ws.write(JSON.stringify(object))
                    ws.write('\n')

                    print(location, result, text)
                }
            })(print)
        }

        if (unique) {
            print = ((print) => {
                const hash = {}

                return (location, result, text) => {
                    if (hash[result.find]) {
                        return
                    }

                    hash[result.find] = true

                    print(location, result, text)
                }
            })(print)
        }

        const { LeaksPilot } = require('../lib/leaks')

        const lp = new LeaksPilot({ db: require('../lib/db') })

        const { eachOfLimit } = require('@pown/async/lib/eachOfLimit')

        await eachOfLimit(it(), taskConcurrency, async(location) => {
            let fetch

            if (/^https?:\/\//.test(location)) {
                fetch = fetchRequest
            }
            else {
                fetch = fetchFile
            }

            const data = await fetch(location)
            const text = data.toString()

            for await (let result of lp.iterateOverSearch(text)) {
                print(location, result, text)
            }
        })
    }
}
