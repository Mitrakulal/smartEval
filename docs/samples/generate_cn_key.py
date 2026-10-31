"""Generate the sample Computer Networks answer key used for demos and parser tests.

Run from the repository root:
    backend/.venv/Scripts/python.exe docs/samples/generate_cn_key.py

Produces CN_CIE1_AnswerKey.docx next to this script. A PDF copy is produced by
converting that file with Word/LibreOffice; the docx is the source of truth.
"""

from pathlib import Path

from docx import Document
from docx.enum.table import WD_TABLE_ALIGNMENT
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.shared import Cm, Pt, RGBColor

OUT = Path(__file__).with_name("CN_CIE1_AnswerKey.docx")

SUBJECT = "Computer Networks (CN)"
PAPER = "Continuous Internal Evaluation I — Model Answer Key"
DURATION = "1 hour 30 minutes"
MAX_MARKS = 30

QUESTIONS = [
    {
        "label": "1(a)",
        "marks": 3,
        "text": "Define the OSI reference model. Name its seven layers and state one function of each.",
        "answer": (
            "The OSI model is a seven-layer reference architecture that divides network "
            "communication into layers, each providing a well-defined service to the layer above "
            "and using the services of the layer below."
        ),
        "points": [
            "Names the seven layers in order: physical, data link, network, transport, session, presentation and application.",
            "States the functions of the physical, data link and network layers: bit transmission, framing with error control, and routing.",
            "States the functions of the transport, session, presentation and application layers: end-to-end delivery, dialog control, translation/encryption and user services.",
        ],
    },
    {
        "label": "1(b)",
        "marks": 3,
        "text": "Differentiate circuit switching and packet switching.",
        "answer": (
            "Circuit switching establishes a dedicated physical path for the entire call, while "
            "packet switching divides the message into packets that are forwarded independently."
        ),
        "points": [
            "Circuit switching reserves a dedicated end-to-end path before transfer; packet switching uses store-and-forward with no reserved path.",
            "Circuit switching wastes capacity during silent periods; packet switching multiplexes statistically and suits bursty traffic.",
            "Circuit switching gives a fixed delay and suits voice; packet switching has variable delay and suits data.",
        ],
    },
    {
        "label": "2(a)",
        "marks": 6,
        "text": "Explain the TCP three-way handshake with a diagram. Why is the handshake needed?",
        "answer": (
            "The three-way handshake establishes a TCP connection and synchronizes the initial "
            "sequence numbers used by both endpoints."
        ),
        "points": [
            "The client sends a SYN segment carrying its initial sequence number (ISN).",
            "The server replies with SYN-ACK, acknowledging the client ISN and sending its own ISN.",
            "The client sends ACK acknowledging the server ISN; the connection is established.",
            "Both endpoints now know each other's ISN, so sequence numbers are synchronized.",
            "The exchange prevents an old duplicate connection request from being accepted.",
            "A labelled diagram shows the client and server states and the three segments.",
        ],
    },
    {
        "label": "2(b)",
        "marks": 6,
        "text": "Compare TCP and UDP. Give one application protocol for each.",
        "answer": (
            "TCP provides a reliable, ordered, connection-oriented byte stream; UDP provides an "
            "unreliable, unordered, connectionless datagram service with much lower overhead."
        ),
        "points": [
            "TCP is connection-oriented; UDP is connectionless.",
            "TCP guarantees delivery using acknowledgements and retransmission; UDP is best-effort.",
            "TCP preserves message ordering; UDP does not.",
            "The TCP header is 20 bytes minimum; the UDP header is 8 bytes.",
            "TCP provides flow and congestion control; UDP provides neither.",
            "HTTP/FTP use TCP; DNS, streaming and VoIP use UDP.",
        ],
    },
    {
        "label": "3(a)",
        "marks": 6,
        "text": (
            "A network uses 192.168.10.0/24. Subnet it into four equal subnets. Show the subnet "
            "mask, network address, usable host range and broadcast address for each subnet."
        ),
        "answer": (
            "Four subnets need two borrowed host bits, so the prefix becomes /26. The block size "
            "is 64 addresses, giving 62 usable hosts per subnet."
        ),
        "points": [
            "Four subnets require 2 borrowed host bits, so the prefix is /24 + 2 = /26.",
            "Subnet mask 255.255.255.192; block size 64 addresses and 62 usable hosts per subnet.",
            "192.168.10.0/26 — usable .1 to .62, broadcast .63.",
            "192.168.10.64/26 — usable .65 to .126, broadcast .127.",
            "192.168.10.128/26 — usable .129 to .190, broadcast .191.",
            "192.168.10.192/26 — usable .193 to .254, broadcast .255.",
        ],
    },
    {
        "label": "3(b)",
        "marks": 6,
        "text": "Explain distance vector routing and the count-to-infinity problem. State one solution.",
        "answer": (
            "Distance vector routing is a Bellman-Ford based algorithm in which each router keeps "
            "the shortest known distance to every destination and exchanges its table with neighbours."
        ),
        "points": [
            "Each router maintains a distance vector giving the metric to every destination.",
            "Routers periodically exchange their full routing table with directly connected neighbours.",
            "The metric is usually hop count, and the route with the smallest metric is installed.",
            "Count-to-infinity occurs when a link fails and stale routes are propagated, so the metric keeps increasing.",
            "Split horizon prevents a route from being advertised back to the neighbour it was learned from.",
            "Poison reverse advertises the failed route with an infinite metric; hold-down timers delay updates.",
        ],
    },
    {
        "label": "4(a)",
        "marks": 6,
        "text": "Explain the DNS resolution process, distinguishing recursive and iterative resolution.",
        "answer": (
            "DNS resolution maps a domain name to a resource record by consulting a hierarchy of "
            "name servers, using caching to avoid repeating the walk for every request."
        ),
        "points": [
            "The stub resolver sends the query to a local or recursive resolver.",
            "In recursive resolution the resolver returns the final answer; in iterative resolution the client queries each server itself.",
            "The resolver queries a root server, which refers it to the TLD server.",
            "The TLD server refers it to the authoritative name server for the domain.",
            "The authoritative server returns the resource record (A, AAAA, CNAME or MX), which the resolver caches with a TTL.",
            "A diagram shows the stub resolver, recursive resolver, root, TLD and authoritative servers.",
        ],
    },
    {
        "label": "4(c)",
        "marks": 6,
        "text": "Explain any three HTTP methods and the difference between HTTP/1.1 and HTTP/2.",
        "answer": (
            "HTTP methods define the operation requested on a resource; HTTP/2 changes how those "
            "requests are carried over the connection."
        ),
        "points": [
            "GET retrieves a resource and is safe and idempotent.",
            "POST creates a resource or submits data and is neither safe nor idempotent.",
            "PUT replaces a resource and is idempotent; DELETE removes a resource and is idempotent.",
            "HTTP/2 uses binary framing, whereas HTTP/1.1 uses text framing.",
            "HTTP/2 multiplexes many streams over one TCP connection, removing HTTP-level head-of-line blocking.",
            "HTTP/2 compresses headers with HPACK and optionally supports server push.",
        ],
    },
]


def shade(cell, hex_color):
    tc_pr = cell._tc.get_or_add_tcPr()
    shd = OxmlElement("w:shd")
    shd.set(qn("w:val"), "clear")
    shd.set(qn("w:color"), "auto")
    shd.set(qn("w:fill"), hex_color)
    tc_pr.append(shd)


def add_field(paragraph, instruction):
    run = paragraph.add_run()
    begin = OxmlElement("w:fldChar")
    begin.set(qn("w:fldCharType"), "begin")
    instr = OxmlElement("w:instrText")
    instr.set(qn("xml:space"), "preserve")
    instr.text = instruction
    separate = OxmlElement("w:fldChar")
    separate.set(qn("w:fldCharType"), "separate")
    placeholder = OxmlElement("w:t")
    placeholder.text = "1"
    end = OxmlElement("w:fldChar")
    end.set(qn("w:fldCharType"), "end")
    for element in (begin, instr, separate, placeholder, end):
        run._r.append(element)


def build():
    doc = Document()
    doc.core_properties.title = "Computer Networks CIE I — Model Answer Key"
    doc.core_properties.author = "SmartEval"

    section = doc.sections[0]
    section.page_height = Cm(29.7)
    section.page_width = Cm(21.0)
    section.top_margin = Cm(2.0)
    section.bottom_margin = Cm(2.0)
    section.left_margin = Cm(2.2)
    section.right_margin = Cm(2.2)

    normal = doc.styles["Normal"]
    normal.font.name = "Calibri"
    normal.font.size = Pt(11)
    normal.paragraph_format.space_after = Pt(4)

    # Footer: page numbers on every page.
    footer = section.footer.paragraphs[0]
    footer.alignment = WD_ALIGN_PARAGRAPH.CENTER
    footer.add_run("Computer Networks — CIE I    |    Page ").font.size = Pt(9)
    add_field(footer, "PAGE")
    footer.add_run(" of ").font.size = Pt(9)
    add_field(footer, "NUMPAGES")

    header = section.header.paragraphs[0]
    header.alignment = WD_ALIGN_PARAGRAPH.RIGHT
    run = header.add_run("SmartEval · Sample Answer Key")
    run.font.size = Pt(9)
    run.font.color.rgb = RGBColor(0x55, 0x55, 0x55)

    # Title block
    title = doc.add_paragraph()
    title.alignment = WD_ALIGN_PARAGRAPH.CENTER
    run = title.add_run("Department of Computer Science and Engineering")
    run.bold = True
    run.font.size = Pt(13)

    subtitle = doc.add_paragraph()
    subtitle.alignment = WD_ALIGN_PARAGRAPH.CENTER
    run = subtitle.add_run(PAPER)
    run.bold = True
    run.font.size = Pt(15)

    subject = doc.add_paragraph()
    subject.alignment = WD_ALIGN_PARAGRAPH.CENTER
    run = subject.add_run(f"{SUBJECT}   ·   Maximum marks: {MAX_MARKS}")
    run.font.size = Pt(11)

    meta = doc.add_table(rows=3, cols=2)
    meta.style = "Table Grid"
    meta.alignment = WD_TABLE_ALIGNMENT.CENTER
    meta_rows = [
        ("Date", "___________"),
        ("Duration", DURATION),
        ("Instructions", "Question 1 is compulsory. Answer any TWO of Q2, Q3 and Q4."),
    ]
    for row, (key, value) in zip(meta.rows, meta_rows):
        row.cells[0].text = key
        row.cells[1].text = value
        row.cells[0].paragraphs[0].runs[0].bold = True

    doc.add_paragraph()

    heading = doc.add_paragraph()
    run = heading.add_run("Instructions to candidates")
    run.bold = True
    run.font.size = Pt(12)

    for text in [
        "Question 1 is compulsory and carries 6 marks (1(a) + 1(b)).",
        "Answer any TWO questions from Q2, Q3 and Q4. Each of these carries 12 marks (two parts of 6 marks).",
        "The total for the paper is 30 marks: Q1 (6) + any two of Q2–Q4 (12 + 12).",
        "Each sub-question carries the marks shown in brackets.",
        "Neat labelled diagrams carry weight wherever they are asked for.",
        "Award 1 mark per key point listed in the scheme of evaluation; round a sub-question total to the nearest 0.5.",
    ]:
        p = doc.add_paragraph(text, style="List Bullet")
        p.paragraph_format.space_after = Pt(2)

    doc.add_paragraph()

    heading = doc.add_paragraph()
    run = heading.add_run("Mark distribution")
    run.bold = True
    run.font.size = Pt(12)

    table = doc.add_table(rows=1, cols=4)
    table.style = "Table Grid"
    widths = [Cm(3.0), Cm(5.5), Cm(3.5), Cm(5.5)]
    headers = ["Question", "Parts", "Marks", "Choice"]
    for cell, text, width in zip(table.rows[0].cells, headers, widths):
        cell.text = text
        cell.width = width
        cell.paragraphs[0].runs[0].bold = True
        shade(cell, "E8EEF7")

    distribution = [
        ("1", "1(a), 1(b)", "3 + 3 = 6", "Compulsory"),
        ("2", "2(a), 2(b)", "6 + 6 = 12", "Any two of Q2–Q4"),
        ("3", "3(a), 3(b)", "6 + 6 = 12", "Any two of Q2–Q4"),
        ("4", "4(a), 4(c)", "6 + 6 = 12", "Any two of Q2–Q4"),
        ("Total", "Q1 + best two of Q2–Q4", "30", "—"),
    ]
    for values in distribution:
        cells = table.add_row().cells
        for cell, text, width in zip(cells, values, widths):
            cell.text = text
            cell.width = width
        if values[0] == "Total":
            for cell in cells:
                for paragraph in cell.paragraphs:
                    for run in paragraph.runs:
                        run.bold = True

    # One main question per page.
    current_group = None
    for question in QUESTIONS:
        group = question["label"][0]
        if group != current_group:
            doc.add_page_break()
            current_group = group

        heading = doc.add_paragraph()
        heading.paragraph_format.space_before = Pt(6)
        run = heading.add_run(
            f"Question {question['label']}    [{question['marks']} marks]"
        )
        run.bold = True
        run.font.size = Pt(13)

        prompt = doc.add_paragraph()
        run = prompt.add_run(question["text"])
        run.italic = True

        answer_label = doc.add_paragraph()
        run = answer_label.add_run("Model answer")
        run.bold = True
        run.font.size = Pt(11)

        doc.add_paragraph(question["answer"])

        scheme_label = doc.add_paragraph()
        run = scheme_label.add_run("Scheme of evaluation")
        run.bold = True
        run.font.size = Pt(11)

        scheme = doc.add_table(rows=1, cols=3)
        scheme.style = "Table Grid"
        widths = [Cm(1.2), Cm(13.6), Cm(2.0)]
        for cell, text, width in zip(scheme.rows[0].cells, ["#", "Key point", "Marks"], widths):
            cell.text = text
            cell.width = width
            cell.paragraphs[0].runs[0].bold = True
            shade(cell, "E8EEF7")

        for index, point in enumerate(question["points"], start=1):
            cells = scheme.add_row().cells
            cells[0].text = str(index)
            cells[1].text = point
            cells[2].text = "1"
            for cell, width in zip(cells, widths):
                cell.width = width

        total_cells = scheme.add_row().cells
        total_cells[1].text = "Total"
        total_cells[2].text = str(question["marks"])
        for cell in total_cells:
            for paragraph in cell.paragraphs:
                for run in paragraph.runs:
                    run.bold = True

    doc.add_paragraph()
    note = doc.add_paragraph()
    run = note.add_run(
        "Note: this key is a teaching sample. The listed key points are the rubric used by "
        "SmartEval; a student answer earns a point when its meaning matches the point, not "
        "when the wording matches."
    )
    run.italic = True
    run.font.size = Pt(9)

    doc.save(OUT)
    print(f"Wrote {OUT}")


if __name__ == "__main__":
    build()
