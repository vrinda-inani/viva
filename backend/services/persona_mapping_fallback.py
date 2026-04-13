"""Static persona fallbacks when the classifier does not supply overrides."""

from __future__ import annotations

from typing import TypedDict


class PersonaProfile(TypedDict):
    title: str
    focus: str


PERSONAS: dict[str, PersonaProfile] = {
    "COMPUTER_SCIENCE": {
        "title": "Lead Architect",
        "focus": "System design, library choices, and logic hotspots.",
    },
    "MATHEMATICS": {
        "title": "Pure Math Professor",
        "focus": "LaTeX proofs, variable logic, and derivation steps.",
    },
    "HUMANITIES": {
        "title": "Literature Critic",
        "focus": "Argumentative flow, thematic analysis, and citation integrity.",
    },
    "PROFESSIONAL": {
        "title": "Executive Recruiter",
        "focus": "Career impact, GitHub project ownership, and resume-to-reality mapping.",
    },
    "OTHER": {
        "title": "Academic Examiner",
        "focus": "Clarity of reasoning, use of evidence, and overall coherence.",
    },
}


def get_persona(subject: str) -> PersonaProfile:
    return PERSONAS.get(subject, PERSONAS["OTHER"])
