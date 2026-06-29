#!/usr/bin/env python3
"""
Seed data for Media Tracker.

Inserts a curated catalog into the media-service MongoDB (media_db.media) and,
optionally, a few library entries for a user into the user-service PostgreSQL
(users_db.user_library). Both steps are idempotent.

Run inside the cluster (pod with the deps) or locally via `kubectl port-forward`.
Defaults target the in-cluster service DNS names.

    python scripts/seed.py                 # catalog only (needs pymongo)
    python scripts/seed.py --with-library  # catalog + admin library (needs psycopg2)

Env overrides: MONGO_URL, DB_NAME(media), SEED_CREATOR,
               PG_HOST, PG_USER, PG_PASSWORD, PG_DB, SEED_USER
"""
import os
import sys
from datetime import datetime

MONGO_URL = os.getenv(
    "MONGO_URL",
    "mongodb://mongo-0.mongo.database.svc.cluster.local:27017,"
    "mongo-1.mongo.database.svc.cluster.local:27017,"
    "mongo-2.mongo.database.svc.cluster.local:27017/?replicaSet=rs0",
)
MEDIA_DB = os.getenv("DB_NAME", "media_db")
CREATOR = os.getenv("SEED_CREATOR", "admin")


def season(num, count):
    return {
        "season_number": num,
        "episodes": [
            {"episode_number": i, "title": f"Episode {i}", "air_date": None}
            for i in range(1, count + 1)
        ],
    }


# media_type values match the form: Movie, Series, Anime, Manga, Web Novel, Light Novel, Book
CATALOG = [
    {"title": "Inception", "media_type": "Movie",
     "description": "A thief who steals corporate secrets through dream-sharing technology is hired to plant an idea instead.", "seasons": []},
    {"title": "Dune", "media_type": "Movie",
     "description": "Paul Atreides allies with the Fremen in a fight for control of the desert planet Arrakis.", "seasons": []},
    {"title": "The Matrix", "media_type": "Movie",
     "description": "A hacker discovers that reality is a simulation and joins a rebellion against the machines.", "seasons": []},
    {"title": "Spirited Away", "media_type": "Movie",
     "description": "A young girl wanders into a world of spirits and must work to free her parents.", "seasons": []},

    {"title": "Breaking Bad", "media_type": "Series",
     "description": "A high-school chemistry teacher turned methamphetamine producer navigates the drug trade.",
     "seasons": [season(1, 7), season(2, 13), season(3, 13), season(4, 13), season(5, 16)]},
    {"title": "Stranger Things", "media_type": "Series",
     "description": "Kids in a small town uncover supernatural mysteries and secret government experiments.",
     "seasons": [season(1, 8), season(2, 9), season(3, 8), season(4, 9)]},
    {"title": "The Last of Us", "media_type": "Series",
     "description": "A smuggler escorts a teenage girl across a post-apocalyptic United States.",
     "seasons": [season(1, 9)]},

    {"title": "Attack on Titan", "media_type": "Anime",
     "description": "Humanity fights for survival against giant man-eating Titans behind enormous walls.",
     "seasons": [season(1, 25), season(2, 12), season(3, 22), season(4, 28)]},
    {"title": "Fullmetal Alchemist: Brotherhood", "media_type": "Anime",
     "description": "Two brothers use alchemy in their search for the Philosopher's Stone to restore their bodies.",
     "seasons": [season(1, 64)]},
    {"title": "Death Note", "media_type": "Anime",
     "description": "A gifted student finds a notebook that kills anyone whose name is written in it.",
     "seasons": [season(1, 37)]},

    {"title": "Berserk", "media_type": "Manga",
     "description": "A lone mercenary's dark, brutal journey of vengeance in a grim medieval world.", "seasons": []},
    {"title": "One Piece", "media_type": "Manga",
     "description": "Monkey D. Luffy and his crew sail the seas in search of the legendary treasure, One Piece.", "seasons": []},
    {"title": "Vinland Saga", "media_type": "Manga",
     "description": "A young Viking seeks revenge amid the wars of 11th-century England and Scandinavia.", "seasons": []},

    {"title": "Re:Zero - Starting Life in Another World", "media_type": "Light Novel",
     "description": "Subaru is transported to a fantasy world where, upon death, he returns to a save point.", "seasons": []},
    {"title": "Mushoku Tensei: Jobless Reincarnation", "media_type": "Light Novel",
     "description": "A man is reincarnated into a magical world and resolves to live his new life without regrets.", "seasons": []},

    {"title": "Dune (Frank Herbert)", "media_type": "Book",
     "description": "The seminal science-fiction novel of politics, religion and ecology on the planet Arrakis.", "seasons": []},
    {"title": "The Lord of the Rings (J. R. R. Tolkien)", "media_type": "Book",
     "description": "The epic quest to destroy the One Ring and defeat the Dark Lord Sauron.", "seasons": []},
]

# (title, media_type, status, current_season, current_episode, rating) for the seeded user's library
LIBRARY_PICKS = [
    ("Breaking Bad", "Series", "Watching", 3, 5, 9),
    ("Attack on Titan", "Anime", "Watching", 4, 10, 10),
    ("Stranger Things", "Series", "Completed", 4, 9, 8),
    ("Dune", "Movie", "Completed", 0, 0, 9),
    ("Inception", "Movie", "Completed", 0, 0, 8),
    ("Berserk", "Manga", "Reading", 0, 0, 10),
    ("Re:Zero - Starting Life in Another World", "Light Novel", "Reading", 0, 0, 9),
    ("The Last of Us", "Series", "Plan to Watch", 0, 0, None),
]


def seed_media():
    from pymongo import MongoClient
    col = MongoClient(MONGO_URL)[MEDIA_DB]["media"]
    new = 0
    for m in CATALOG:
        doc = {**m, "creator": CREATOR, "created_at": datetime.utcnow()}
        res = col.update_one({"title": m["title"]}, {"$setOnInsert": doc}, upsert=True)
        if res.upserted_id:
            new += 1
    print(f"[media]   {new} new, {len(CATALOG) - new} already present; catalog total = {col.count_documents({})}")
    return col


def seed_library(col):
    try:
        import psycopg2
    except ImportError:
        print("[library] psycopg2 not installed -> skipping (run media-only, or pip install psycopg2-binary)")
        return
    user = os.getenv("SEED_USER", "admin")
    conn = psycopg2.connect(
        host=os.getenv("PG_HOST", "postgres-rw.database.svc.cluster.local"),
        user=os.getenv("PG_USER", "admin"),
        password=os.getenv("PG_PASSWORD", "password"),
        dbname=os.getenv("PG_DB", "users_db"),
    )
    cur = conn.cursor()
    cur.execute("SELECT id FROM users WHERE username = %s", (user,))
    row = cur.fetchone()
    if not row:
        print(f"[library] user '{user}' not found -> skipping")
        return
    uid = row[0]
    added = 0
    for title, mtype, status, cs, ce, rating in LIBRARY_PICKS:
        doc = col.find_one({"title": title})
        if not doc:
            continue
        mid = str(doc["_id"])
        cur.execute("SELECT 1 FROM user_library WHERE user_id = %s AND media_id = %s", (uid, mid))
        if cur.fetchone():
            continue
        cur.execute(
            """INSERT INTO user_library
               (user_id, media_id, media_title, media_type, status, current_season, current_episode, rating)
               VALUES (%s, %s, %s, %s, %s, %s, %s, %s)""",
            (uid, mid, title, mtype, status, cs, ce, rating),
        )
        added += 1
    conn.commit()
    cur.close()
    conn.close()
    print(f"[library] {added} entries added for user '{user}' (id {uid})")


if __name__ == "__main__":
    col = seed_media()
    if "--with-library" in sys.argv or os.getenv("SEED_LIBRARY"):
        seed_library(col)
