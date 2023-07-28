const path = require('path');
const fse = require('fs-extra');
const {Proskomma} = require('proskomma-core');

const usage = "node diglot.js <config.json> <output.html>";

if (process.argv.length !== 4) {
    console.log(`Wrong number of arguments\n${usage}`);
    process.exit(1);
}

const configPath = path.resolve(process.argv[2]);
let config;
try {
    config = fse.readJsonSync(configPath)
} catch (err) {
    console.log(`Could not load config file at '${configPath}'\n${usage}`);
    process.exit(1);
}
const htmlPath = path.resolve(process.argv[3]);

const mkId = (lang, abbr) => `${lang}_${abbr}`;
let ids = [];
const keyId = mkId(config.translations[0].lang, config.translations[0].abbr);
ids.push(keyId);

const pk = new Proskomma();
for (const translation of config.translations) {
    const content = fse.readFileSync(path.resolve(translation.path))
        .toString()
        .replace(/<</g, "“")
        .replace(/>>/g, "”")
        .replace(/</g, "‘")
        .replace(/>/g, "’");
    pk.importDocument({
            lang: translation.lang,
            abbr: translation.abbr
        },
        'usfm',
        content
    )
}

const result = pk.gqlQuerySync(`{
  docSets {
    selectors {key value}
    documents {
      cvIndexes {
        chapter
        verses {
          verse {
            verseRange
            text(normalizeSpace: true)
          }
        }
      }
    }
  }
}`);

const cvs = {};
const keyVersionResult = result.data.docSets
    .filter(
        ds => mkId(
            ds.selectors.filter(s => s.key === "lang")[0].value,
            ds.selectors.filter(s => s.key === "abbr")[0].value
        ) === keyId
    )[0].documents[0];
for (const cvIndex of keyVersionResult.cvIndexes) {
    cvs[cvIndex.chapter] = {};
    for (const verses of cvIndex.verses) {
        if (!verses.verse) {
            continue;
        }
        if (verses.verse.length > 0) {
            cvs[cvIndex.chapter][verses.verse[0].verseRange] = {};
            cvs[cvIndex.chapter][verses.verse[0].verseRange][keyId] = verses.verse[0].text;

        }
    }
}
const otherVersions = result.data.docSets
    .filter(
    ds => mkId(
        ds.selectors.filter(s => s.key === "lang")[0].value,
        ds.selectors.filter(s => s.key === "abbr")[0].value
    ) !== keyId
);

for (const otherVersion of otherVersions) {
    const otherId = mkId(
        otherVersion.selectors.filter(s => s.key === "lang")[0].value,
        otherVersion.selectors.filter(s => s.key === "abbr")[0].value
        );
    ids.push(otherId);
    for (const cvIndex of otherVersion.documents[0].cvIndexes) {
        for (const verses of cvIndex.verses) {
            if (!verses.verse) {
                continue;
            }
            if (verses.verse.length > 0) {
                if (cvs[cvIndex.chapter][verses.verse[0].verseRange]) {
                    cvs[cvIndex.chapter][verses.verse[0].verseRange][otherId] = verses.verse[0].text;
                }
            }
        }
    }
}
let htmlBits = ["<html>", "<head>", "<title>Bible</title>", "</head>", "<body>", "<h1>Bible</h1>", "<table>"];
htmlBits.push("<tbody>");
for (const [chapterN, chapterRecord] of Object.entries(cvs)) {
    htmlBits.push("<tr>", `<th colspan="${ids.length + 1}" style="font-size: xx-large; border-bottom: black 2px solid">- ${chapterN} - </th>`, "</tr>");
    htmlBits.push("<tr>");
    htmlBits.push('<th></th>');
    for (const id of ids) {
        htmlBits.push(`<th>${id}</th>`);
    }
    htmlBits.push("</tr>");
    for (const [verseN, verseRecord] of Object.entries(chapterRecord)) {
        const rowBG = "#FFF";
        htmlBits.push("<tr>");
        htmlBits.push(`<th style="vertical-align: top; background-color: ${rowBG}; padding: 5px 15px">${verseN}</th>`);
        for (const id of ids) {
            htmlBits.push(`<td style="vertical-align: top; background-color: ${rowBG}; text-align: justify; padding: 5px 15px">${verseRecord[id]}</td>`);
        }
        htmlBits.push("</tr>");
    }
}
htmlBits.push("</tbody>");
htmlBits.push("</table>", "<body>", "</html>");
fse.writeFileSync(htmlPath, htmlBits.join('\n'));
