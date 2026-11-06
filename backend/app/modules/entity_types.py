import enum


class EntityType(enum.StrEnum):
    """Records that notes and reminders can attach to."""

    job = "job"
    research = "research"
    contact = "contact"


class LinkableType(enum.StrEnum):
    """Records a contact can be linked to."""

    job = "job"
    research = "research"
