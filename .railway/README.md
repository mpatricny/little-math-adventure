# Railway

`railway.ts` je jediný popis Railway projektu pro API a PostgreSQL. Plán lze
bezpečně zobrazit příkazem `railway config plan`; změny se provedou až přes
`railway config apply` po ruční kontrole.

Kód API se publikuje z adresáře `server/`, aby upload neobsahoval herní assety:

```bash
cd server
railway up --service api --environment production
```

Před prvním nasazením nastavte `LOG_LEVEL=info`. `APP_RELEASE` může release proces
přepsat názvem tagu; jinak API použije Railway commit SHA. `DATABASE_URL`,
`NODE_ENV` a `CORS_ORIGINS` spravuje IaC soubor.
