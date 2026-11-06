import uuid
from datetime import datetime
from typing import Annotated

from pydantic import (
    AfterValidator,
    BaseModel,
    ConfigDict,
    EmailStr,
    Field,
    StringConstraints,
)

Email = Annotated[EmailStr, AfterValidator(str.lower)]
FullName = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=120)]
NewPassword = Annotated[str, Field(min_length=10, max_length=128)]


class RegisterIn(BaseModel):
    full_name: FullName
    email: Email
    password: NewPassword


class LoginIn(BaseModel):
    email: Email
    password: Annotated[str, Field(min_length=1, max_length=128)]


class ProfileUpdateIn(BaseModel):
    full_name: FullName | None = None
    email: Email | None = None


class ChangePasswordIn(BaseModel):
    current_password: Annotated[str, Field(min_length=1, max_length=128)]
    new_password: NewPassword


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    full_name: str
    email: str
    created_at: datetime
