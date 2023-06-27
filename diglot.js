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

const keyLanguage = config.translations[0].lang;

const pk = new Proskomma();
for (const translation of config.translations) {
    pk.importDocument({
            lang: translation.lang,
            abbr: translation.abbr
        },
        'usfm',
        fse.readFileSync(path.resolve(translation.path)))
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
const keyVersionResult = result.data.docSets.filter(ds => ds.selectors.filter(s => s.key === "lang")[0].value === keyLanguage)[0].documents[0];
for (const cvIndex of keyVersionResult.cvIndexes) {
    cvs[cvIndex.chapter] = {};
    for (const verses of cvIndex.verses) {
        if (!verses.verse) {
            continue;
        }
        if (verses.verse.length > 0) {
            cvs[cvIndex.chapter][verses.verse[0].verseRange] = {};
            cvs[cvIndex.chapter][verses.verse[0].verseRange][keyLanguage] = verses.verse[0].text;

        }
    }
}
const otherVersions = result.data.docSets.filter(ds => ds.selectors.filter(s => s.key === "lang")[0].value !== keyLanguage);
for (const otherVersion of otherVersions) {
    const otherLang = otherVersion.selectors.filter(s => s.key === "lang")[0].value;
    for (const cvIndex of otherVersion.documents[0].cvIndexes) {
        for (const verses of cvIndex.verses) {
            if (!verses.verse) {
                continue;
            }
            if (verses.verse.length > 0) {
                if (cvs[cvIndex.chapter][verses.verse[0].verseRange]) {
                    cvs[cvIndex.chapter][verses.verse[0].verseRange][otherLang] = verses.verse[0].text;
                }
            }
        }
    }
}
let htmlBits = ["<html>", "<head>", "<title>Bible</title>", "</head>", "<body>", "<h1>Bible</h1>", "<table>"];
htmlBits.push("<tbody>");
const langs = result.data.docSets.map(ds => ds.selectors.filter(s => s.key === 'lang')[0].value);
for (const [chapterN, chapterRecord] of Object.entries(cvs)) {
    htmlBits.push("<tr>", `<th colspan="${langs.length + 1}" style="font-size: xx-large; border-bottom: black 2px solid">- ${chapterN} - </th>`, "</tr>");
    htmlBits.push("<tr>");
    htmlBits.push('<th></th>');
    for (const lang of langs) {
        htmlBits.push(`<th>${lang}</th>`);
    }
    htmlBits.push("</tr>");
    for (const [verseN, verseRecord] of Object.entries(chapterRecord)) {
        const rowBG = "#FFF";
        htmlBits.push("<tr>");
        htmlBits.push(`<th style="vertical-align: top; background-color: ${rowBG}; padding: 5px 15px">${verseN}</th>`);
        for (const lang of langs) {
            htmlBits.push(`<td style="vertical-align: top; background-color: ${rowBG}; text-align: justify; padding: 5px 15px">${verseRecord[lang]}</td>`);
        }
        htmlBits.push("</tr>");
    }
}
htmlBits.push("</tbody>");
htmlBits.push("</table>", "<body>", "</html>");
fse.writeFileSync(htmlPath, htmlBits.join('\n'));
