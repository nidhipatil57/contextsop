import os
import re
import tempfile

from flask import Blueprint, Response, make_response, request
from reportlab.lib import colors

# PDF Generation imports
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.platypus import KeepTogether, Paragraph, SimpleDocTemplate, Spacer

from ..auth import require_auth
from ..schemas import WorkflowDsl, migrate_sop_dsl

export_bp = Blueprint("export", __name__)


def sanitize_string(text: str) -> str:
    """
    Sanitizes user input by stripping any HTML tags/scripts to prevent HTML injection,
    SSRF, or Local File Inclusion (LFI) in the PDF/HTML compilers.
    """
    if not text:
        return ""
    # Strip any <script>, <iframe>, <link> tags or any HTML tag structures
    return re.sub(r"<[^>]*>", "", text)


def dsl_to_markdown(dsl: WorkflowDsl) -> str:
    """
    Compiles a WorkflowDsl structure into clean Markdown runbook format.
    """
    md = []
    md.append(f"# {sanitize_string(dsl.metadata.title)}")
    md.append(f"\n{sanitize_string(dsl.metadata.description)}\n")

    if dsl.metadata.target_environment:
        md.append(f"**Target Environment:** {sanitize_string(dsl.metadata.target_environment)}")
    if dsl.metadata.estimated_duration:
        md.append(f"**Estimated Duration:** {dsl.metadata.estimated_duration} minutes")

    if dsl.variables:
        md.append("\n## Variables")
        for var in dsl.variables:
            default_str = f" (default: `{var.default_value}`)" if var.default_value else ""
            md.append(f"- `{var.name}`: {var.label} [{var.type.value}]{default_str}")

    md.append("\n## Action Steps")
    for idx, step in enumerate(dsl.steps, 1):
        md.append(f"\n### Step {idx}: {sanitize_string(step.title)} (ID: `{step.id}`)")
        md.append(f"**Type:** {step.type.value.capitalize()}")
        md.append(f"\n{sanitize_string(step.content)}")

    return "\n".join(md)


def dsl_to_html(dsl: WorkflowDsl) -> str:
    """
    Compiles WorkflowDsl structure into a high-fidelity, interactive, and styled HTML page.
    Uses Outfit font, sleek dark styles, and organized containers.
    """
    title = sanitize_string(dsl.metadata.title)
    description = sanitize_string(dsl.metadata.description)
    target_env = (
        sanitize_string(dsl.metadata.target_environment)
        if dsl.metadata.target_environment
        else "N/A"
    )
    duration = dsl.metadata.estimated_duration if dsl.metadata.estimated_duration else "N/A"

    # Compile variables list HTML
    variables_html = ""
    if dsl.variables:
        variables_html += '<div class="card"><h2>Configuration Variables</h2><ul>'
        for var in dsl.variables:
            def_val = (
                f"(Default: <code>{sanitize_string(var.default_value)}</code>)"
                if var.default_value
                else ""
            )
            variables_html += f"""
            <li>
                <strong>{sanitize_string(var.name)}</strong>: {sanitize_string(var.label)} 
                <span class="badge badge-secondary">{var.type.value}</span>
                {def_val}
            </li>"""
        variables_html += "</ul></div>"

    # Compile steps list HTML
    steps_html = ""
    for idx, step in enumerate(dsl.steps, 1):
        step_type_class = f"badge-{step.type.value}"
        content_html = ""
        if step.type.value == "command":
            content_html = f"<pre><code>{sanitize_string(step.content)}</code></pre>"
        else:
            # Replace newlines with breaks
            content_html = f"<p>{sanitize_string(step.content).replace(chr(10), '<br/>')}</p>"

        steps_html += f"""
        <div class="card step-card">
            <div class="step-header">
                <h3>Step {idx}: {sanitize_string(step.title)}</h3>
                <span class="badge {step_type_class}">{step.type.value}</span>
            </div>
            <div class="step-content">
                {content_html}
            </div>
        </div>"""

    outfit_url = "https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;600;700&display=swap"  # noqa: E501
    fira_url = "https://fonts.googleapis.com/css2?family=Fira+Code:wght@400;500&display=swap"  # noqa: E501

    # Premium dark styling with modern UI aesthetics
    html_template = f"""<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>{title} | ContextSOP Runbook</title>
    <link href="{outfit_url}" rel="stylesheet">
    <link href="{fira_url}" rel="stylesheet">
    <style>
        :root {{
            --bg-color: #0f172a;
            --card-bg: #1e293b;
            --text-primary: #f8fafc;
            --text-secondary: #94a3b8;
            --accent: #3b82f6;
            --success: #10b981;
            --warning: #f59e0b;
            --border: #334155;
        }}
        body {{
            font-family: 'Outfit', sans-serif;
            background-color: var(--bg-color);
            color: var(--text-primary);
            margin: 0;
            padding: 2rem 1rem;
            line-height: 1.5;
        }}
        .container {{
            max-width: 800px;
            margin: 0 auto;
        }}
        header {{
            margin-bottom: 2rem;
            border-bottom: 1px solid var(--border);
            padding-bottom: 1.5rem;
        }}
        h1 {{
            font-size: 2.5rem;
            margin: 0 0 0.5rem 0;
            background: linear-gradient(135deg, #60a5fa, #3b82f6);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
        }}
        .meta-container {{
            display: flex;
            gap: 1.5rem;
            font-size: 0.9rem;
            color: var(--text-secondary);
            margin-top: 1rem;
        }}
        .meta-item strong {{
            color: var(--text-primary);
        }}
        .card {{
            background-color: var(--card-bg);
            border: 1px solid var(--border);
            border-radius: 12px;
            padding: 1.5rem;
            margin-bottom: 1.5rem;
            box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1);
        }}
        .card h2 {{
            margin-top: 0;
            font-size: 1.25rem;
            border-bottom: 1px solid var(--border);
            padding-bottom: 0.5rem;
        }}
        ul {{
            padding-left: 1.25rem;
            margin: 0;
        }}
        li {{
            margin-bottom: 0.5rem;
        }}
        .badge {{
            display: inline-block;
            padding: 0.25rem 0.5rem;
            font-size: 0.75rem;
            font-weight: 600;
            border-radius: 4px;
            text-transform: uppercase;
        }}
        .badge-secondary {{
            background-color: var(--border);
            color: var(--text-primary);
        }}
        .badge-command {{ background-color: var(--accent); color: white; }}
        .badge-warning {{ background-color: var(--warning); color: #0f172a; }}
        .badge-checkbox {{ background-color: var(--success); color: white; }}
        .badge-input {{ background-color: #8b5cf6; color: white; }}
        .badge-verification {{ background-color: #ec4899; color: white; }}
        
        .step-card {{
            border-left: 4px solid var(--accent);
        }}
        .step-header {{
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 1rem;
        }}
        .step-header h3 {{
            margin: 0;
            font-size: 1.2rem;
        }}
        pre {{
            background-color: #0b0f19;
            border: 1px solid var(--border);
            border-radius: 8px;
            padding: 1rem;
            overflow-x: auto;
            margin: 0;
        }}
        code {{
            font-family: 'Fira Code', monospace;
            font-size: 0.9rem;
            color: #38bdf8;
        }}
    </style>
</head>
<body>
    <div class="container">
        <header>
            <h1>{title}</h1>
            <p style="color: var(--text-secondary); margin: 0;">{description}</p>
            <div class="meta-container">
                <div class="meta-item">Target Environment: <strong>{target_env}</strong></div>
                <div class="meta-item">Estimated Duration: <strong>{duration} min</strong></div>
            </div>
        </header>

        {variables_html}

        <h2>Execution Steps</h2>
        {steps_html}
    </div>
</body>
</html>"""
    return html_template


def compile_pdf_file(dsl: WorkflowDsl, file_path: str):
    """
    Renders the WorkflowDsl to a highly formatted PDF, ensuring page-break grouping rules.
    """
    doc = SimpleDocTemplate(
        file_path,
        pagesize=letter,
        rightMargin=54,
        leftMargin=54,
        topMargin=54,
        bottomMargin=54,
    )
    story = []

    # Styles Setup
    styles = getSampleStyleSheet()

    # Custom styles
    title_style = ParagraphStyle(
        "PDFTitle",
        parent=styles["Heading1"],
        fontName="Helvetica-Bold",
        fontSize=22,
        leading=26,
        textColor=colors.HexColor("#0F172A"),
        spaceAfter=12,
    )

    desc_style = ParagraphStyle(
        "PDFDesc",
        parent=styles["BodyText"],
        fontName="Helvetica-Oblique",
        fontSize=10,
        leading=14,
        textColor=colors.HexColor("#475569"),
        spaceAfter=10,
    )

    meta_style = ParagraphStyle(
        "PDFMeta",
        parent=styles["BodyText"],
        fontName="Helvetica",
        fontSize=9,
        leading=13,
        textColor=colors.HexColor("#64748B"),
        spaceAfter=15,
    )

    h2_style = ParagraphStyle(
        "PDFH2",
        parent=styles["Heading2"],
        fontName="Helvetica-Bold",
        fontSize=14,
        leading=18,
        textColor=colors.HexColor("#1E3A8A"),  # Navy Accent
        spaceBefore=14,
        spaceAfter=8,
    )

    body_style = ParagraphStyle(
        "PDFBody",
        parent=styles["BodyText"],
        fontName="Helvetica",
        fontSize=10,
        leading=14,
        textColor=colors.HexColor("#334155"),
        spaceAfter=8,
    )

    code_style = ParagraphStyle(
        "PDFCode",
        fontName="Courier",
        fontSize=9,
        leading=12,
        textColor=colors.HexColor("#0F172A"),
        backColor=colors.HexColor("#F8FAFC"),
        borderColor=colors.HexColor("#E2E8F0"),
        borderWidth=1,
        borderPadding=8,
        spaceAfter=8,
    )

    # Document Header
    story.append(Paragraph(sanitize_string(dsl.metadata.title), title_style))
    story.append(Paragraph(sanitize_string(dsl.metadata.description), desc_style))

    # Meta specs
    meta_parts = []
    if dsl.metadata.target_environment:
        meta_parts.append(
            f"<b>Target Environment:</b> {sanitize_string(dsl.metadata.target_environment)}"
        )
    if dsl.metadata.estimated_duration:
        meta_parts.append(f"<b>Estimated Duration:</b> {dsl.metadata.estimated_duration} minutes")
    if meta_parts:
        story.append(Paragraph(" | ".join(meta_parts), meta_style))

    # Variables Block
    if dsl.variables:
        story.append(Paragraph("Configuration Variables", h2_style))
        for var in dsl.variables:
            var_desc = (
                f"<b>{sanitize_string(var.name)}</b> ({var.type.value}): "
                f"{sanitize_string(var.label)}"
            )
            if var.default_value:
                var_desc += f" [Default: <i>{sanitize_string(var.default_value)}</i>]"
            story.append(Paragraph(var_desc, body_style))
        story.append(Spacer(1, 10))

    # Steps Block
    story.append(Paragraph("Action Steps", h2_style))
    for idx, step in enumerate(dsl.steps, 1):
        step_elements = []

        step_title = f"<b>Step {idx}: {sanitize_string(step.title)}</b> [{step.type.value.upper()}]"
        step_elements.append(
            Paragraph(
                step_title,
                ParagraphStyle(
                    "StepH3",
                    parent=styles["Heading3"],
                    fontSize=11,
                    leading=14,
                    textColor=colors.HexColor("#2563EB"),
                    spaceBefore=6,
                    spaceAfter=4,
                ),
            )
        )

        content_clean = sanitize_string(step.content).replace("\n", "<br/>")
        if step.type.value == "command":
            step_elements.append(Paragraph(content_clean, code_style))
        else:
            step_elements.append(Paragraph(content_clean, body_style))

        step_elements.append(Spacer(1, 8))

        # Bundle heading and content together to prevent orphans/widows on page breaks
        story.append(KeepTogether(step_elements))

    doc.build(story)


def stream_temp_file(file_path: str):
    """
    Yields file contents in chunks and deletes the file afterwards to prevent disk leak.
    """
    try:
        with open(file_path, "rb") as f:
            while True:
                chunk = f.read(8192)
                if not chunk:
                    break
                yield chunk
    finally:
        try:
            os.remove(file_path)
        except OSError:
            pass


@export_bp.post("/markdown")
@require_auth
def export_markdown():
    """
    Exports a Workflow DSL to standard Markdown document.
    """
    raw_payload = request.get_json(silent=True) or {}
    migrated_payload = migrate_sop_dsl(raw_payload)
    dsl = WorkflowDsl.model_validate(migrated_payload)
    content = dsl_to_markdown(dsl)

    response = make_response(content)
    response.headers["Content-Type"] = "text/markdown"
    response.headers["Content-Disposition"] = "attachment; filename=runbook.md"
    return response


@export_bp.post("/html")
@require_auth
def export_html():
    """
    Exports a Workflow DSL to standard rich interactive HTML template.
    """
    raw_payload = request.get_json(silent=True) or {}
    migrated_payload = migrate_sop_dsl(raw_payload)
    dsl = WorkflowDsl.model_validate(migrated_payload)
    content = dsl_to_html(dsl)

    response = make_response(content)
    response.headers["Content-Type"] = "text/html"
    response.headers["Content-Disposition"] = "attachment; filename=runbook.html"
    return response


@export_bp.post("/pdf")
@require_auth
def export_pdf():
    """
    Streams a compiled PDF version of the Workflow DSL from temporary file to prevent server OOM.
    """
    raw_payload = request.get_json(silent=True) or {}
    migrated_payload = migrate_sop_dsl(raw_payload)
    dsl = WorkflowDsl.model_validate(migrated_payload)

    # Create temporary file
    temp_fd, temp_path = tempfile.mkstemp(suffix=".pdf")
    os.close(temp_fd)

    try:
        compile_pdf_file(dsl, temp_path)
        # Use streaming response to stream in chunks
        return Response(
            stream_temp_file(temp_path),
            mimetype="application/pdf",
            headers={"Content-Disposition": "attachment; filename=runbook.pdf"},
        )
    except Exception as e:
        # Try to clean up the temp file if compilation failed
        try:
            os.remove(temp_path)
        except OSError:
            pass
        raise e
