import { expect } from "chai";
import { parseDitaXml, resolveBackend } from "../dist/detect/index.js";
import { detectTests } from "../dist/detectTests.js";
import { defaultFileTypes } from "../dist/fileTypes.js";
import { validate } from "../dist/validate.js";

const first = (nodes, kind) => nodes.find((n) => n.kind === kind);
const all = (nodes, kind) => nodes.filter((n) => n.kind === kind);

describe("detect: dita/xml backend", function () {
  it("emits comment nodes with exact offsets", function () {
    const xml = '<topic id="t"><body><!-- test {"testId": "d"} --><p>x</p></body></topic>';
    const nodes = parseDitaXml(xml);
    const c = first(nodes, "comment");
    expect(c.content).to.equal('test {"testId": "d"}');
    expect(xml.slice(c.startIndex, c.endIndex)).to.equal(
      '<!-- test {"testId": "d"} -->'
    );
  });

  it("emits element nodes with decoded attributes and inner text", function () {
    const xml =
      '<topic id="t"><body><p>Click the <uicontrol outputclass="btn">Search &amp; Find</uicontrol> field.</p></body></topic>';
    const nodes = parseDitaXml(xml);
    const el = nodes.find((n) => n.kind === "element" && n.tag === "uicontrol");
    expect(el.attributes).to.deep.equal({ outputclass: "btn" });
    expect(el.content).to.equal("Search & Find");
    expect(el.precedingText).to.match(/Click the $/);
  });

  it("maps <b> and <i> to strong and emphasis", function () {
    const xml = "<p>See <b>bold</b> and <i>italic</i>.</p>";
    const nodes = parseDitaXml(xml);
    expect(first(nodes, "strong").text).to.equal("bold");
    expect(first(nodes, "emphasis").text).to.equal("italic");
  });

  it("maps <codeblock> to codeBlock and <image> to image nodes", function () {
    const xml =
      '<body><codeblock outputclass="language-bash">ls -la</codeblock><image href="shot.png" alt="A shot"/></body>';
    const nodes = parseDitaXml(xml);
    const cb = first(nodes, "codeBlock");
    expect(cb.content).to.equal("ls -la");
    const img = first(nodes, "image");
    expect(img.src).to.equal("shot.png");
    expect(img.attributes.href).to.equal("shot.png");
  });

  it("defaults language, src, and alt when attributes are absent", function () {
    const xml = "<body><codeblock>ls</codeblock><image/></body>";
    const nodes = parseDitaXml(xml);
    expect(first(nodes, "codeBlock").language).to.equal("");
    const img = first(nodes, "image");
    expect(img.src).to.equal("");
    expect(img.alt).to.equal("");
    expect(img.attributes).to.equal(undefined);
  });

  it("emits text runs as raw source slices", function () {
    const xml = '<p>Press "Enter" now.</p>';
    const nodes = parseDitaXml(xml);
    expect(first(nodes, "text").text).to.equal('Press "Enter" now.');
  });

  it("parses documents with an XML prolog and DOCTYPE", function () {
    const xml =
      '<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE task PUBLIC "-//OASIS//DTD DITA Task//EN" "task.dtd">\n<task id="x"><title>T</title></task>';
    const nodes = parseDitaXml(xml);
    expect(nodes.find((n) => n.tag === "title")).to.exist;
  });

  it("throws on malformed XML (degrades to regex-only upstream)", function () {
    expect(() => parseDitaXml("<topic><unclosed</topic>")).to.throw();
  });

  it("tolerates rootless fragments via a synthetic root with corrected offsets", function () {
    const xml = '<!-- step {"wait": 1} -->\n';
    const nodes = parseDitaXml(xml);
    const c = first(nodes, "comment");
    expect(c.content).to.equal('step {"wait": 1}');
    expect(xml.slice(c.startIndex, c.endIndex)).to.equal(
      '<!-- step {"wait": 1} -->'
    );
  });

  it("resolves dita extensions and the dita fileType name", function () {
    for (const ext of ["dita", "ditamap", "xml"]) {
      expect(resolveBackend(ext), ext).to.be.a("function");
    }
    expect(resolveBackend("weird", { name: "dita", extensions: [] })).to.be.a(
      "function"
    );
  });
});

describe("dita built-in fileType", function () {
  it("uses comment and data-element statement containers plus legacy PI regexes", function () {
    const ft = defaultFileTypes.dita;
    expect(ft.inlineStatements.in).to.deep.equal([
      "comment",
      {
        element: { tag: "data", attributes: { name: "doc-detective" } },
        value: "attributes.value",
      },
    ]);
    // <?doc-detective …?> statements stay regex-only (deprecated channel).
    expect(ft.inlineStatements.testStart).to.have.length(1);
    expect(ft.inlineStatements.testStart[0]).to.include("doc-detective");
    expect(ft.markup.every((m) => !m.regex)).to.equal(true);
  });

  it("validates dita as an extends target in config_v3", function () {
    const result = validate({
      schemaKey: "config_v3",
      object: { fileTypes: [{ extends: "dita", extensions: ["ditax"] }] },
    });
    expect(result.valid, result.errors).to.be.true;
  });

  it("detects the full maximal example end-to-end", async function () {
    const content = [
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<task id="search-task">',
      "  <title>Search for kittens</title>",
      "  <taskbody>",
      '    <!-- test {"testId": "dita-search"} -->',
      "    <steps>",
      '      <step><cmd>Go to <xref href="https://www.google.com" scope="external">Google</xref>.</cmd></step>',
      '      <step><cmd>Click the <uicontrol>Search</uicontrol> field.</cmd></step>',
      "      <step><cmd>Type <userinput>kittens</userinput> into the <uicontrol>Search</uicontrol> field.</cmd></step>",
      '      <step><cmd>Press "Enter".</cmd></step>',
      "      <step><cmd>Confirm the <wintitle>Results</wintitle> window shows <b>kittens</b>.</cmd></step>",
      '      <!-- step {"screenshot": true} -->',
      "      <step><cmd><data name=\"doc-detective\" value='step {\"wait\": 1000}'/>Wait for results.</cmd></step>",
      "    </steps>",
      "    <!-- test ignore start -->",
      '    <p><xref href="https://example.com/broken">untested</xref></p>',
      "    <!-- test ignore end -->",
      "    <!-- test end -->",
      "  </taskbody>",
      "</task>",
      "",
    ].join("\n");
    const tests = await detectTests({
      content,
      filePath: "doc.dita",
      fileType: defaultFileTypes.dita,
      config: { detectSteps: true },
    });
    expect(tests).to.have.length(1);
    expect(tests[0].testId).to.equal("dita-search");
    const kinds = tests[0].steps.map((s) =>
      Object.keys(s).find((k) => k !== "location" && k !== "stepId")
    );
    // Definition pairs double-fire exactly like the legacy regexes did:
    // navigateToXref+goToUrl and checkExternalXref+checkHyperlink on the
    // Google xref, clickUiControl+findUiControl on the first uicontrol,
    // chained typeIntoUiControl+findUiControl on the second, typeText on
    // prose, find on wintitle and <b>. The ignored block drops the broken
    // xref; the data-element and comment steps land in offset order.
    expect(kinds).to.deep.equal([
      "goTo",
      "goTo",
      "checkLink",
      "checkLink",
      "click",
      "find",
      "type",
      "find",
      "type",
      "find",
      "find",
      "screenshot",
      "wait",
    ]);
    const typeStep = tests[0].steps.find((s) => s.type?.keys);
    expect(typeStep.type).to.deep.include({ keys: "kittens", selector: "Search" });
    expect(tests[0].steps.at(-1).wait).to.equal(1000);
  });

  it("still detects statements via legacy PI regexes", async function () {
    const content = [
      '<topic id="pi">',
      "  <body>",
      '    <?doc-detective test {"testId": "pi-test"}?>',
      '    <?doc-detective step {"wait": 5}?>',
      "    <?doc-detective test end?>",
      "  </body>",
      "</topic>",
      "",
    ].join("\n");
    const tests = await detectTests({
      content,
      filePath: "doc.dita",
      fileType: defaultFileTypes.dita,
    });
    expect(tests).to.have.length(1);
    expect(tests[0].testId).to.equal("pi-test");
    expect(tests[0].steps.map((s) => s.wait)).to.deep.equal([5]);
  });
});
