# Link Bypass Setup — Free Account Cookies

AniMela ka `/api/v1/unshorten` resolver **GDToT, Sharer.pw aur AppDrive** jaise
file-host protectors ko **free mein bypass** kar sakta hai — lekin inke liye ek
**free account** ki zaroorat hai (sirf cookie/token paste karni hoti hai).

Ye guide batata hai ki wo cookie kahan se milegi aur Railway pe kahan daalni hai.

> ⚠️ Google reCAPTCHA wale protectors (mobilejsr, linkszilla ke kuch links) is
> method se **nahi** bypass hote — unka koi free bypass nahi hai. Ye sirf un
> links ke liye hai jo **GDToT / Sharer.pw / AppDrive** pe direct jaate hain.

---

## 1. GDToT (`crypt` cookie)

GDToT ek Google Drive file-host hai. Iska link aisa dikhta hai:

```
https://new.gdtot.com/file/17121456488
https://new6.gdtot.cfd/ddl/2406804987
```

**Bypass karne ke liye `crypt` cookie chahiye** — free account login karne pe milti hai.

### Step-by-step

1. **GDToT ka current domain kholo.** GDToT ke domains rotate hote hain
   (`gdtot.cfd`, `gdtot.com`, `new.gdtot.com`, `new6.gdtot.cfd`…). Jo bhi abhi
   chalta hai, wahi use karo — Google pe "GDToT" search karke current mirror
   dhoondo.

2. **Free account banao** — homepage pe `Register` / `Sign up` button. Email +
   password do (koi payment nahi).

3. **Login karo.**

4. **Browser DevTools kholo** — `F12` (ya right-click → Inspect).

5. **Cookies tab kholo:**
   - Chrome/Edge: `Application` tab → left sidebar → `Storage` → `Cookies`
   - Firefox: `Storage` tab → `Cookies`

6. **`crypt` naam ki cookie dhoondo** (gdtot domain ke under). Uska **Value**
   copy karo (double-click karke full select karo, phir Ctrl+C).

   > Tip: agar `crypt` dikhe nahi, to login ke baad page refresh karo, ya
   > cookies list mein `Name` column ke hisaab se sort karo.

7. **Railway pe daalo:**
   - [railway.app](https://railway.app) → apna project → **Settings → Variables**
   - Naya variable add karo:
     - **Name:** `GDTOT_CRYPT`
     - **Value:** (copy kiya hua cookie value)
   - Deploy/Redeploy ho jayega.

8. **Test:** GDToT link ko `/api/v1/unshorten?url=<gdtot-link>` pe daalo →
   `resolvedUrl` mein Google Drive link milega.

> ⚠️ Cookie kabhi-kabhi expire hoti hai. Agar resolve band ho jaye, to dobara
> login karke nayi cookie copy kar lena.

---

## 2. Sharer.pw (`XSRF-TOKEN` + `laravel_session`)

Sharer.pw ek aur Google Drive look-alike protector hai. Iske liye **2 cookies**
chahiye.

1. `sharer.pw` pe free account banao + login karo.
2. DevTools → Cookies → `sharer.pw` domain ke under:
   - `XSRF-TOKEN` ki value copy karo
   - `laravel_session` ki value copy karo
3. Railway Variables mein 2 entry daalo:
   - `SHARER_XSRF_TOKEN` = XSRF-TOKEN value
   - `SHARER_LARAVEL_SESSION` = laravel_session value

---

## 3. AppDrive family (`email` + `password`)

AppDrive look-alikes (appdrive.in, driveapp.in, drivehub.in, gdflix.pro,
drivesharer.in, drivebit.in, drivelinks.in, driveace.in, drivepro.in) mein
**direct email/password** chalta hai (cookie nahi).

1. Kisi bhi AppDrive-family site pe free account banao.
2. Railway Variables mein:
   - `APPDRIVE_EMAIL` = tera email
   - `APPDRIVE_PASSWORD` = tera password

---

## Railway Variables kaise daalte hain (common)

1. [railway.app](https://railway.app) → apna **AniMela** project kholo
2. **Settings** tab → **Variables** section
3. **New Variable** → Name + Value daalo → Save
4. Railway automatically redeploy karega (kuch minute lagte hain)

---

## Test kaise karein

```
https://animela.up.railway.app/api/v1/unshorten?url=<YOUR_GDToT_OR_SHARER_LINK>
```

- `ok: true` + `resolvedUrl` → success (Google Drive / direct link)
- `ok: false` + `note: "no direct link found"` → cookie galat/expire hui, ya
  link captcha-gated hai

---

## Summary table

| Protector | Kya chahiye | Env var |
| --- | --- | --- |
| GDToT | `crypt` cookie (free account) | `GDTOT_CRYPT` |
| Sharer.pw | `XSRF-TOKEN` + `laravel_session` | `SHARER_XSRF_TOKEN`, `SHARER_LARAVEL_SESSION` |
| AppDrive family | email + password | `APPDRIVE_EMAIL`, `APPDRIVE_PASSWORD` |
| AdFly / GPLinks / DropLink | kuch nahi | — |
