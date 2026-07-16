import logging
from flask import Blueprint, g, jsonify, request
from pydantic import BaseModel, Field
from openai import OpenAI
from ..auth import require_auth
from ..config import Settings

logger = logging.getLogger(__name__)
component_bp = Blueprint("component", __name__)


class ComponentGenerateRequest(BaseModel):
    prompt: str = Field(min_length=3, max_length=1000)


class ComponentGenerationResponse(BaseModel):
    code: str = Field(description="The complete standalone TSX component code.")
    component_name: str = Field(alias="componentName", description="The component name in PascalCase.")


COMPONENT_SYSTEM_PROMPT = """
You are an expert React and UI engineer.
Your task is to generate a standalone React TSX component based on the user's prompt.
This component will be rendered inside an SRE runbook to assist engineers with complex operations.

Strict Guidelines:
1. STANDALONE COMPONENT:
   - Provide a single, complete export default component in TypeScript React (.tsx).
   - Do NOT import any external CSS files.
   - Use standard React Hooks (useState, useEffect, useMemo, etc.) if needed.
2. TAILWIND CSS STYLING:
   - Use Tailwind CSS utility classes for styling.
   - The UI should feel premium, match modern developer tools, and adjust to dark/light themes. Use theme color classes or neutral tailwind colors.
3. SAFE IMPORTS ONLY:
   - You can only import from:
     - 'react' (e.g. useState, useEffect, etc.)
     - 'lucide-react' (icons)
   - Do NOT import from other libraries.
4. ISOLATED OPERATION:
   - The component must be self-contained and perform its logic (e.g. parsing, selecting, charting) locally.
   - It must accept no external props other than optionally basic styling variables.
5. NO WRAPPERS OR SCRIPTS:
   - Do not include HTML/body/head tags.
   - Do not perform fetch calls to external untrusted APIs.
"""


@component_bp.post("/generate")
@require_auth
def generate_component():
    """
    Generates a custom React component code using LLM.
    """
    payload = ComponentGenerateRequest.model_validate(request.get_json(silent=True) or {})

    settings = Settings()
    api_key = settings.openai_api_key
    if not api_key:
        return jsonify(error="Config Error", message="OpenAI API key is missing in config."), 500

    client = OpenAI(api_key=api_key)

    try:
        completion = client.beta.chat.completions.parse(
            model="gpt-4o-mini",
            messages=[
                {"role": "system", "content": COMPONENT_SYSTEM_PROMPT},
                {"role": "user", "content": f"Generate a component for: {payload.prompt}"},
            ],
            response_format=ComponentGenerationResponse,
            temperature=0.2,
        )

        parsed_response = completion.choices[0].message.parsed
        if not parsed_response:
            return jsonify(error="Generation Error", message="Failed to parse component code."), 500

        return jsonify(
            code=parsed_response.code,
            componentName=parsed_response.component_name
        )

    except Exception as e:
        logger.exception("Error during LLM component generation")
        return jsonify(error="Internal Error", message=str(e)), 500
