# ssmmss — build commands

Run from the repo root: `D:\tutorials\repo\ssmmss`

## Clean rebuild of the APK

```powershell
cd apps/android
.\gradlew.bat --stop
.\gradlew.bat clean assembleRelease
```

`--stop` is required on Windows — a running Gradle daemon locks the lint-cache
files and `clean` fails with `Unable to delete directory ... app\build`.

Output: `apps/android/app/build/outputs/apk/release/app-release.apk`

## Build without cleaning (incremental, much faster)

```powershell
cd apps/android; .\gradlew.bat assembleRelease
```

## Install on the phone

```powershell
adb install -r apps/android/app/build/outputs/apk/release/app-release.apk
```


## how to run on local network
1. npm run dev:api
2. npm --prefix apps/web run dev -- --host 0.0.0.0

## For Fresh start wipe the database the default admin/admin is auto create after 'npm run dev:api'
TRUNCATE TABLE "Message", "OtpRequest", "SimCard", "Device", "ApiKey", "User" CASCADE;