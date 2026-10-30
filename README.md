# Econ Lab Night

A real-time multiplayer party game where every round is a famous economics experiment. Players join from any phone or laptop with a 4-letter room code (no accounts, no installs), decide privately against a timer, then see everyone's choices charted against what game theory predicts and what real lab studies found.

## The five rounds

| Round | Experiment | What it shows |
| --- | --- | --- |
| Guess ⅔ of the average | Keynesian beauty contest | How many steps ahead people actually think |
| The group pot | Public goods game | Free riding vs. cooperation |
| Split the $10 | Ultimatum game | People pay to punish unfairness |
| The mystery jar | Common-value auction | The winner's curse |
| Friday at the bar | El Farol problem | Coordination without communication |

## Features

- Room codes, join links and QR codes; up to 40 players
- "Present on a shared screen" mode for classes and clubs (projector view; the host runs the game without playing)
- Live answer tracking, round timer, "reveal now" when everyone's in
- Refresh-safe: reloading rejoins the same seat; players who join mid-round start next round
- If the host drops, the earliest-joined player automatically takes over running the game
- Host can remove players; duplicate names are numbered
- Running scoreboard, final podium, copyable class summary, and one-tap rematch

## Tech

Vanilla JavaScript (ES modules), no build step. Firebase Realtime Database keeps every screen in sync; static hosting on GitHub Pages. Open with `?mock=1` to run locally across browser tabs without Firebase.
