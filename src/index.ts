import request from "request";
import path from "path";
import fs from "fs";

import readline from 'readline';

const LOCAL = "localhost:3000";
const ONLINE = "leech-server.herokuapp.com";

const argv = process.argv.slice(2);
const debug = argv.filter(a => a === "-d" || a === "--debug").length > 0;

function log (message?: unknown, level: number = 0) {
    let mss = " " + message;

    for (let i=0; i<level; i++) {
        mss = `+${mss}`;
    }

    console.log(mss.trim());
}

function promptAsk (text: string) : Promise<string> {
    const rl = readline.createInterface({
        "input": process.stdin,
        "output": process.stdout,
    });

    return new Promise(
        resolve => {
            rl.question(text, answer => {
                rl.close();
                return resolve(answer);
            });
        }
    );
}

function get (url: string) : Promise<string> {
    return new Promise(
        (resolve, reject) => {
            request.get(url, (error, response, body) => {
                if (error) return reject(error);
                if (response.statusCode !== 200) return reject(new Error(`Request failed with code ${response.statusCode}`));

                return resolve(body);
            });
        }
    );
}

async function getMov (local: boolean, silent: boolean, query: string) : Promise<Movie | null> {
    const url = `http://${local ? LOCAL : ONLINE}/api/movie/search?q=${encodeURI(query)}`;

    if (debug) log(`Get '${url}'`);

    try {
        const data = JSON.parse(await get(url)) as TypedJson;

        if (data.__type__ === "MovieInfo") {
            return data as Movie;
        }

        // assume type === "SearchResult"
        const searchResult = data as SearchResult;
        const results = searchResult.results as Movie[];

        if (silent) return null;

        log("We found 2 or more movies. Please choose one.");
        for (const idx in results) {
            log(`${parseInt(idx) + 1}. ${results[idx].movid}`);
        }
        const ans = await promptAsk("You choose: ");
        try {
            const chose = parseInt(ans) - 1;
            return JSON.parse(await get(`http://${local ? LOCAL : ONLINE}/api/human/${results[chose].url}`)) as Movie;

        } catch (err) {
            return null;
        }

    } catch (err) {
        console.error(err);
        return null;
    }
}

async function getPpl (local: boolean, silent: boolean, query: string) : Promise<Human | null> {
    const url = `http://${local ? LOCAL : ONLINE}/api/human/search?q=${encodeURI(query)}`;

    if (debug) log(`Get '${url}'`);

    try {
        const data = JSON.parse(await get(url)) as TypedJson;

        if (data.__type__ === "HumanInfo") {
            return data as Human;
        }

        // assume type === "SearchResult"
        const searchResult = data as SearchResult;
        const results = searchResult.results as Human[];

        for (const result of results) {
            if (result.name.value === query) {
                return JSON.parse(await get(`http://${local ? LOCAL : ONLINE}/api/human/${result.url}`)) as Human;
            }
        }

        if (silent) return null;

        log("We found 2 or more people. Please choose one.");
        for (const idx in results) {
            log(`${parseInt(idx) + 1}. ${results[idx].name.type} (${results[idx].name.engname})`);
        }
        const ans = await promptAsk("You choose: ");
        try {
            const chose = parseInt(ans) - 1;
            return JSON.parse(await get(`http://${local ? LOCAL : ONLINE}/api/human/${results[chose].url}`)) as Human;

        } catch (err) {
            return null;
        }

    } catch (err) {
        console.error(err);
        return null;
    }
}

function download (local: boolean, uri: string, filepath: string) : Promise<void> {
    const url = `http://${local ? LOCAL : ONLINE}${uri}`;

    if (debug) log(`Downloading '${url}'`);

    return new Promise(
        (resolve, reject) => {
            request.get(
                url, (error, response) => {
                    if (error) return reject(error);
                    if (response.statusCode !== 200) return reject(new Error(`Request failed with code ${response.statusCode}`));
                }
            ).pipe(fs.createWriteStream(filepath))
                .on("error", err => {
                    return reject(err);
                })
                .on("close", () => {
                    return resolve();
                });
        }
    );
}

const recursive = argv.filter(a => a === "-r").length > 0;
const local = argv.filter(a => a === "-l" || a === "--local").length > 0;
const cwd = process.cwd();

const cachePath = "d:\\etc\\gcollect\\cache.json";
const cache: { [name: string]: string } = JSON.parse("" + fs.readFileSync(cachePath));

function writeCache () {
    fs.writeFileSync(cachePath, JSON.stringify(cache, null, 4));
}

async function getData (local: boolean, silent: boolean, name: string, dir: string) : Promise<void> {
    try {
        const movData = await getMov(local, silent, name);

        if (!movData) {
            console.error(`Not found mov '${name}'`);
            return;
        }

        if (debug) log(movData);

        log("Download cover.jpg", 1);
        await download(local, movData.covers[0], path.join(dir, name, `${name.toLowerCase()}_cover.jpg`));

        log("Download thumb.jpg", 1);
        await download(local, movData.thumb[0], path.join(dir, name, `${name.toLowerCase()}_thumb.jpg`));

        for (const idx in movData.screenshots) {
            let filename = `${name.toLowerCase()}_screenshot.jpg`;

            if (movData.screenshots.length > 1) {
                filename = `${name.toLowerCase()}_screenshot${(((parseInt(idx)+1) + "").padStart(2, "0"))}.jpg`;
            }

            log(`Download ${filename}`, 1);
            await download(local, movData.screenshots[idx], path.join(dir, name, filename));
        }

        // read actor data and rename file
        const people: string[] = [];

        log(`Finding actors for ${name}`, 1);

        for (const actor of movData.actors) {
            if (Object.prototype.hasOwnProperty.call(cache, actor.text)) {
                // actor cached
                people.push(cache[actor.text]);

            } else {
                // new actor
                const pplData = await getPpl(local, silent, actor.text);

                if (pplData) {
                    if (debug) log(pplData);

                    const actorNameValue = pplData.name.engname.split(" ").reverse().join(" ");

                    cache[actor.text] = actorNameValue;
                    people.push(actorNameValue);

                } else {
                    console.error(`Not found human '${actor.text}'`);
                }
            }
        }

        // read mov name for tagging
        let tag = "";
        const nameval = name.toUpperCase().slice(0, 4);

        switch (nameval) {
            case "1PON":
            case "10MU":
            case "CARI":
            case "PACO":
            case "TOKY":
                tag = "[jav; unc]";
                break;

            case "FC2 ":
                log("Found FC2 mov, check yourself ok");
                tag = "[jav; unc]";
                break;

            default:
                tag = "[jav]";
                break;
        }

        if (movData.actors.length == 0 && nameval === "FC2 " && movData.director !== null) {
            people.push(movData.director.text);
        }

        // rename
        if (recursive) {
            const newName = `${people.join("; ")} @ ${name} ${tag}`.trim();
            log(`Rename ${name} -> ${newName}`);
            fs.renameSync(path.join(dir, name), path.join(dir, newName));

        } else {
            log("Cannot rename without recursive mode");
        }


    } catch (error) {
        console.error(error);
    }
}

const silent = argv.filter(a => a === "-s" || a === "--silent").length > 0;

if (debug) log(`Params: ${JSON.stringify(argv)}`);

if (silent) log("<<<SILENT MODE>>>");

if (argv[0] === "get") {
    const key = argv[1];

    log("Result");
    if (Object.prototype.hasOwnProperty.call(cache, key)) {
        log(`{ '${key}': '${cache[key]}' }`);

    } else {
        log(`{ '${key}': undefined }`);
    }

} else if (argv[0] === "set") {
    const [key, value] = argv.slice(1, 3);

    cache[key] = value;
    log(`Set key:'${key}' to '${value}'`);

    writeCache();

} else {
    if (!recursive) {
        const { dir, name } = path.parse(cwd);
        getData(local, silent, name, dir)
            .then(() => {
                writeCache();
            })
            .catch(err => {
                console.error(`${err}`);
            });

    } else {
        const dir = cwd;
        const dirs = fs.readdirSync(dir);

        (async () => {
            for (const name of dirs) {
                try {
                    log(`Get data for '${name}'`);
                    await getData(local, silent, name, dir);
                    log();

                } catch (err) {
                    console.error(`Error while process ${name}: ${err}`);
                }
            }

            writeCache();
        })()
        .catch(err => {
            console.error(`${err}`);
        });
    }
}