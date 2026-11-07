# Two-minute demo script

A walkthrough for a screen recording or a live demo. It runs about 2 minutes. Use the demo
account from the seed script so the dashboard already has data:

```bash
docker compose exec -e DEMO_PASSWORD='choose-a-password' api python scripts/seed_demo.py
```

Sign in as `demo@example.com` before you start recording. Use a desktop-width window, and
a phone-width window for the last step.

| Time | Screen | Say and do |
|---|---|---|
| 0:00 to 0:10 | Login page, then dashboard | "CareerLab is one place for job applications, research opportunities, contacts and deadlines." Sign in. The dashboard loads. |
| 0:10 to 0:30 | Dashboard | Point at the eight summary cards. "These numbers come from live queries, not stored counts." Show the job and opportunity pipelines, then the upcoming deadlines and recent activity lists. Click the bell: "It shows reminders that are overdue or due in the next three days." |
| 0:30 to 0:50 | Job Applications, Kanban | Open **Job Applications** and switch to **Kanban**. Drag a card from Applied to Interview. "The card moves at once and rolls back with a message if the save fails." Open a card's menu: "Every card has a status menu, so it works from the keyboard." |
| 0:50 to 1:05 | Job detail | Open the card. Show the details, notes by kind, linked contact, reminder and the activity timeline. "The timeline shows the status change I just made." |
| 1:05 to 1:20 | Research Opportunities, detail | Open **Graduate Research Program in Machine Learning**. Tick a document in the checklist: "2 of 5 ready" becomes "3 of 5". "This is a program I apply to." |
| 1:20 to 1:45 | Research Projects, detail | Open **Research Projects**, then **Adaptive Sampling for Sparse Sensor Networks**. "This is my own paper. One venue rejected it and I planned another." Show the two submissions and the reviewer feedback. Tick a milestone: "2 of 4 done" becomes "3 of 4". Back on the dashboard, point at the project's deadlines in Upcoming deadlines. |
| 1:45 to 1:50 | Reminders | Open **Reminders**. Complete the overdue reminder. The number on the header bell drops by one. |
| 1:50 to 2:00 | Phone width, then API docs | Shrink the window to phone width: the sidebar becomes a menu and the Kanban scrolls sideways. Then open `/docs` on the API: "Every endpoint is documented, and every record belongs to one user." |

## Before you record

- Seed fresh data on the day you record. Dates are relative to the day you run the seed, so the
  upcoming deadlines and the overdue reminder only look right for a few days.
- To reseed, delete the demo user first, because the script exits if the account exists. This also
  deletes the account's records:

  ```bash
  docker compose exec db psql -U careerlab -d careerlab \
    -c "DELETE FROM users WHERE email = 'demo@example.com'"
  ```

  If you changed `POSTGRES_USER` in `.env`, use that name instead of `careerlab`.
- Do not show the `.env` file or the password you chose.
