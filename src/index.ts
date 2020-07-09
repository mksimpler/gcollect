import request from "request";
import path from "path";
import fs from "fs";

import readline from 'readline';

const argv = process.argv.slice(2);
const debug = argv.filter(a => a === "-d" || a === "--debug").length > 0;

function log (message: unknown = "", level: number = 0) {
    if (typeof message === "string") {
        let mss = " " + message;

        for (let i=0; i<level; i++) {
            mss = `+${mss}`;
        }

        console.log(mss.trim());

    } else {
        console.log(message);
    }
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

const configPath = "d:\\etc\\gcollect";
const config: Json = JSON.parse("" + fs.readFileSync(path.join(configPath, "config.json")));

const LOCAL = config["domain-local"];
const ONLINE = config["domain-online"];

async function getMov (local: boolean, silent: boolean, query: string) : Promise<Movie | null> {
    const url = `http://${local ? LOCAL : ONLINE}/${config["mov-path-search"]}?q=${encodeURI(query)}`;

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
            return JSON.parse(await get(`http://${local ? LOCAL : ONLINE}/${config["mov-path"]}/${results[chose].url}`)) as Movie;

        } catch (err) {
            return null;
        }

    } catch (err) {
        if (debug) console.error(err);
        return null;
    }
}

async function getPpl (local: boolean, silent: boolean, query: string) : Promise<Human | null> {
    const url = `http://${local ? LOCAL : ONLINE}/${config["ppl-path-search"]}?q=${encodeURI(query)}`;

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
                return JSON.parse(await get(`http://${local ? LOCAL : ONLINE}/${config["ppl-path"]}/${result.url}`)) as Human;
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
            return JSON.parse(await get(`http://${local ? LOCAL : ONLINE}/${config["ppl-path"]}/${results[chose].url}`)) as Human;

        } catch (err) {
            return null;
        }

    } catch (err) {
        if (debug) console.error(err);
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

const cachePath = path.join(configPath, config["cache"]);
const cache: Json = JSON.parse("" + fs.readFileSync(cachePath));

const tagCachePath = path.join(configPath, config["tag"]);
const tagCache: Json = JSON.parse("" + fs.readFileSync(tagCachePath));

function writeCache (filepath: string, data: Json) {
    fs.writeFileSync(filepath, JSON.stringify(data, null, 4));
}

async function getData (local: boolean, silent: boolean, name: string, dir: string) : Promise<void> {

    if (fs.existsSync(path.join(dir, name, `${name.toLowerCase()}_cover.jpg`))) {
        return;
    }

    try {
        let tag = "";
        const people: string[] = [];
        const nameval = name.slice(0, 4).trim().toUpperCase();

        // read mov name for tagging
        switch (nameval) {

            case "FC2":
                tag = "[jav; unc]";
                break;

            default:
                if (Object.prototype.hasOwnProperty.call(tagCache, nameval)) {
                    tag = tagCache[nameval];

                } else {
                    tag = "[jav]";
                }
                break;
        }

        log(`Get data for '${name}'`);
        const movData = await getMov(local, silent, name);

        if (movData) {
            if (debug) log(movData);

            log("Download cover.jpg", 1);
            if (movData.covers.length > 0) {
                await download(local, movData.covers[0], path.join(dir, name, `${name.toLowerCase()}_cover.jpg`));

                log("Download thumb.jpg", 1);
                await download(local, movData.thumb[0], path.join(dir, name, `${name.toLowerCase()}_thumb.jpg`));

            } else {
                await download(local, movData.thumb[0], path.join(dir, name, `${name.toLowerCase()}_cover.jpg`));
            }

            for (const idx in movData.screenshots) {
                let filename = `${name.toLowerCase()}_screenshot.jpg`;

                if (movData.screenshots.length > 1) {
                    filename = `${name.toLowerCase()}_screenshot${(((parseInt(idx)+1) + "").padStart(2, "0"))}.jpg`;
                }

                log(`Download ${filename}`, 1);
                await download(local, movData.screenshots[idx], path.join(dir, name, filename));
            }

            // read actor data
            if (movData.actors.length > 0) {
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
            } else if (nameval === "FC2" && movData.label !== null) {
                people.push(movData.label.text);
            }

            if (nameval === "FC2" && movData.label !== null && Object.prototype.hasOwnProperty.call(tagCache, movData.label.text)) {
                tag = tagCache[movData.label.text];
            }

        } else {
            console.error(`Not found mov '${name}'`);
        }

        // rename
        if (recursive) {
            let newName = name;
            if (tag) newName = `${name} ${tag}`;
            if (people.length > 0) newName = `${people.join("; ")} @ ${name} ${tag}`;

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

if (argv[0] === "get-tag") {
    const key = argv[1];

    log("Result");
    if (key === "--all" || key === "-a") {
        log(JSON.stringify(tagCache, null, 2));

    } else {
        if (Object.prototype.hasOwnProperty.call(tagCache, key)) {
            log(`{ '${key}': '${tagCache[key]}' }`);

        } else {
            log(`{ '${key}': undefined }`);
        }
    }
} else if (argv[0] === "set-tag") {
    const [key, value] = argv.slice(1, 3);

    tagCache[key] = value;
    log(`Set key:'${key}' to '${value}'`);

    writeCache(tagCachePath, tagCache);

} else if (argv[0] === "get-cache") {
    const key = argv[1];

    log("Result");
    if (key === "--all" || key === "-a") {
        log(JSON.stringify(cache, null, 2));

    } else {
        if (Object.prototype.hasOwnProperty.call(cache, key)) {
            log(`{ '${key}': '${cache[key]}' }`);

        } else {
            log(`{ '${key}': undefined }`);
        }
    }
} else if (argv[0] === "set-cache") {
    const [key, value] = argv.slice(1, 3);

    cache[key] = value;
    log(`Set key:'${key}' to '${value}'`);

    writeCache(cachePath, cache);

} else {
    Promise.resolve()
        .then(async () => {
            if (!recursive) {
                const { dir, name } = path.parse(cwd);
                await getData(local, silent, name, dir);

            } else {
                const dir = cwd;
                const dirs = fs.readdirSync(dir);

                for (const name of dirs) {
                    try {
                        await getData(local, silent, name, dir);
                        log();

                    } catch (err) {
                        console.error(`Error while process ${name}: ${err}`);
                    }
                }
            }
        }).then(() => {
            writeCache(cachePath, cache);

        }).catch(err => {
            console.error(`${err}`);
        });
}