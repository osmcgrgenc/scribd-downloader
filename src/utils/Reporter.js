import cliProgress from "cli-progress"

class CliReporter {
    log(message) {
        console.log(message)
    }

    error(message) {
        console.error(message)
    }

    createProgress(label, total) {
        const bar = new cliProgress.SingleBar({}, cliProgress.Presets.shades_classic)
        bar.start(total, 0, { label })
        return {
            update(value) {
                bar.update(value)
            },
            stop() {
                bar.stop()
            }
        }
    }
}

export const cliReporter = new CliReporter()
