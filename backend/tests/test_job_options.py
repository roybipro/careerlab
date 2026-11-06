"""More job and internship options: employment types, source, dates, pay period, visa, credit."""

import pytest
from fastapi.testclient import TestClient

from tests.conftest import register_user
from tests.isolation import assert_isolated

JOBS = "/api/v1/jobs"

NEW_FIELDS = (
    "source",
    "start_date",
    "end_date",
    "pay_period",
    "visa_sponsorship",
    "academic_credit",
)
ENUMS = {
    "employment_type": [
        "full_time",
        "part_time",
        "internship",
        "contract",
        "temporary",
        "co_op",
        "apprenticeship",
        "freelance",
        "graduate_program",
    ],
    "source": [
        "linkedin",
        "company_website",
        "referral",
        "job_board",
        "university_career_center",
        "recruiter",
        "other",
    ],
    "pay_period": ["hourly", "monthly", "yearly", "stipend", "unpaid"],
    "visa_sponsorship": ["yes", "no", "unknown"],
}


@pytest.fixture
def ana(client: TestClient) -> TestClient:
    register_user(client)
    return client


def make_job(c: TestClient, **fields) -> dict:
    r = c.post(JOBS, json={"company_name": "Acme", "position_title": "Engineer", **fields})
    assert r.status_code == 201, r.text
    return r.json()


def names(c: TestClient, **params) -> list[str]:
    r = c.get(JOBS, params={"sort": "company_name", **params})
    assert r.status_code == 200, r.text
    return [j["company_name"] for j in r.json()["items"]]


def test_new_fields_default_to_null(ana):
    job = make_job(ana)
    for field in NEW_FIELDS:
        assert job[field] is None, field
    assert ana.get(f"{JOBS}/{job['id']}").json()[NEW_FIELDS[0]] is None


@pytest.mark.parametrize(
    ("field", "value"), [(f, v) for f, values in ENUMS.items() for v in values]
)
def test_each_enum_value_is_accepted_on_create_and_patch(ana, field, value):
    assert make_job(ana, **{field: value})[field] == value
    other = make_job(ana)
    r = ana.patch(f"{JOBS}/{other['id']}", json={field: value})
    assert r.status_code == 200 and r.json()[field] == value


@pytest.mark.parametrize("field", list(ENUMS))
def test_invalid_enum_value_is_422(ana, field):
    body = {"company_name": "A", "position_title": "B", field: "nonsense"}
    assert ana.post(JOBS, json=body).status_code == 422
    job = make_job(ana)
    assert ana.patch(f"{JOBS}/{job['id']}", json={field: "nonsense"}).status_code == 422


def test_academic_credit_is_a_nullable_boolean(ana):
    assert make_job(ana, academic_credit=True)["academic_credit"] is True
    job = make_job(ana, academic_credit=False)
    assert job["academic_credit"] is False
    url = f"{JOBS}/{job['id']}"
    assert ana.patch(url, json={"academic_credit": True}).json()["academic_credit"] is True
    assert ana.patch(url, json={"academic_credit": None}).json()["academic_credit"] is None
    r = ana.post(
        JOBS, json={"company_name": "A", "position_title": "B", "academic_credit": "maybe"}
    )
    assert r.status_code == 422


def test_dates_are_stored_and_can_be_cleared(ana):
    job = make_job(ana, start_date="2030-06-01", end_date="2030-08-31")
    assert job["start_date"] == "2030-06-01" and job["end_date"] == "2030-08-31"
    r = ana.patch(f"{JOBS}/{job['id']}", json={"start_date": None, "end_date": None})
    assert r.status_code == 200
    assert r.json()["start_date"] is None and r.json()["end_date"] is None


def test_same_day_start_and_end_is_allowed(ana):
    job = make_job(ana, start_date="2030-06-01", end_date="2030-06-01")
    assert job["end_date"] == "2030-06-01"


def test_end_before_start_is_422_on_create(ana):
    r = ana.post(
        JOBS,
        json={
            "company_name": "A",
            "position_title": "B",
            "start_date": "2030-06-02",
            "end_date": "2030-06-01",
        },
    )
    assert r.status_code == 422 and r.json()["error"]["code"] == "validation_error"
    assert r.json()["error"]["details"][0]["loc"] == ["body", "end_date"]


def test_patch_with_one_date_uses_the_stored_other_one(ana):
    job = make_job(ana, start_date="2030-06-01", end_date="2030-08-31")
    url = f"{JOBS}/{job['id']}"
    # Only end_date is sent: it is checked against the stored start_date.
    r = ana.patch(url, json={"end_date": "2030-05-31"})
    assert r.status_code == 422 and r.json()["error"]["code"] == "validation_error"
    # Only start_date is sent: it is checked against the stored end_date.
    assert ana.patch(url, json={"start_date": "2030-09-01"}).status_code == 422
    # Both sent: the pair is checked together.
    assert (
        ana.patch(url, json={"start_date": "2031-01-01", "end_date": "2030-12-31"}).status_code
        == 422
    )
    stored = ana.get(url).json()
    assert stored["start_date"] == "2030-06-01" and stored["end_date"] == "2030-08-31"
    # Moving both forward together, or one within range, works.
    ok = ana.patch(url, json={"start_date": "2031-01-01", "end_date": "2031-03-01"})
    assert ok.status_code == 200
    assert ana.patch(url, json={"end_date": "2031-01-01"}).status_code == 200


def test_patch_clearing_one_date_is_allowed(ana):
    job = make_job(ana, start_date="2030-06-01", end_date="2030-08-31")
    assert ana.patch(f"{JOBS}/{job['id']}", json={"end_date": None}).status_code == 200


def test_date_range_is_also_a_database_constraint(ana, db):
    from sqlalchemy import text
    from sqlalchemy.exc import IntegrityError

    job = make_job(ana)
    with pytest.raises(IntegrityError):
        db.execute(
            text(
                "UPDATE job_applications SET start_date = '2030-02-01', end_date = '2030-01-01' "
                "WHERE id = :id"
            ),
            {"id": job["id"]},
        )
    db.rollback()


def test_start_date_is_a_sort_field_with_nulls_last(ana):
    make_job(ana, company_name="late", start_date="2030-09-01")
    make_job(ana, company_name="early", start_date="2030-01-01")
    make_job(ana, company_name="none")
    asc = ana.get(JOBS, params={"sort": "start_date"}).json()["items"]
    assert [j["company_name"] for j in asc] == ["early", "late", "none"]
    desc = ana.get(JOBS, params={"sort": "-start_date"}).json()["items"]
    assert [j["company_name"] for j in desc] == ["late", "early", "none"]


def test_filter_by_employment_type(ana):
    make_job(ana, company_name="A", employment_type="co_op")
    make_job(ana, company_name="B", employment_type="apprenticeship")
    make_job(ana, company_name="C")
    assert names(ana, employment_type="co_op") == ["A"]
    assert names(ana, employment_type="apprenticeship") == ["B"]
    assert names(ana, employment_type="freelance") == []
    assert ana.get(JOBS, params={"employment_type": "nonsense"}).status_code == 422


def test_filter_by_source(ana):
    make_job(ana, company_name="A", source="referral")
    make_job(ana, company_name="B", source="linkedin")
    make_job(ana, company_name="C")
    assert names(ana, source="referral") == ["A"]
    assert names(ana, source="recruiter") == []
    assert ana.get(JOBS, params={"source": "nonsense"}).status_code == 422


def test_category_splits_internships_from_jobs_including_null_type(ana):
    types = {
        "Intern": "internship",
        "Coop": "co_op",
        "Full": "full_time",
        "Part": "part_time",
        "Contract": "contract",
        "Temp": "temporary",
        "Appr": "apprenticeship",
        "Free": "freelance",
        "Grad": "graduate_program",
        "Unset": None,
    }
    for name, employment_type in types.items():
        make_job(ana, company_name=name, employment_type=employment_type)
    internships = names(ana, category="internships")
    jobs = names(ana, category="jobs")
    assert internships == ["Coop", "Intern"]
    assert jobs == sorted(set(types) - {"Intern", "Coop"})
    assert "Unset" in jobs
    assert sorted(internships + jobs) == sorted(names(ana))
    assert ana.get(JOBS, params={"category": "all"}).status_code == 422
    assert ana.get(JOBS, params={"category": "nonsense"}).status_code == 422


def test_category_combines_with_other_filters_and_totals(ana):
    make_job(ana, company_name="A", employment_type="internship", source="referral")
    make_job(ana, company_name="B", employment_type="internship", source="linkedin")
    make_job(ana, company_name="C", source="referral")
    assert names(ana, category="internships", source="referral") == ["A"]
    assert names(ana, category="jobs", source="referral") == ["C"]
    assert names(ana, category="internships", employment_type="co_op") == []
    r = ana.get(JOBS, params={"category": "internships"}).json()
    assert r["total"] == 2


def test_new_fields_and_filters_are_isolated_between_users(ana, second_client):
    job = make_job(ana, employment_type="co_op", source="referral", start_date="2030-01-01")
    assert_isolated(ana, second_client, f"{JOBS}/{job['id']}", {"source": "other"})
    for params in (
        {"category": "internships"},
        {"employment_type": "co_op"},
        {"source": "referral"},
    ):
        assert second_client.get(JOBS, params=params).json()["total"] == 0
    assert ana.get(JOBS, params={"category": "internships"}).json()["total"] == 1


def test_old_record_with_nulls_still_reads_and_updates(ana, db):
    from sqlalchemy import text

    # A row as the previous version wrote it: none of the new columns set.
    job = make_job(ana, employment_type="internship", salary_min=10, salary_max=20)
    db.execute(
        text(
            "UPDATE job_applications SET source = NULL, start_date = NULL, end_date = NULL, "
            "pay_period = NULL, visa_sponsorship = NULL, academic_credit = NULL WHERE id = :id"
        ),
        {"id": job["id"]},
    )
    db.commit()
    url = f"{JOBS}/{job['id']}"
    body = ana.get(url).json()
    assert all(body[f] is None for f in NEW_FIELDS)
    r = ana.patch(url, json={"notes": "still works", "end_date": "2030-01-05"})
    assert r.status_code == 200 and r.json()["end_date"] == "2030-01-05"
    assert ana.patch(url, json={"start_date": "2030-01-06"}).status_code == 422
    assert ana.patch(url, json={"start_date": "2030-01-01"}).status_code == 200
