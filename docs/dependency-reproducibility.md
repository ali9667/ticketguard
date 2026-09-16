# Dependency Reproducibility

The project pins its Node/npm engine range and declares dependency versions in both package manifests. A committed npm lockfile should be generated with npm 10.9.2 before a release is tagged.

The build environment used to prepare this submission had no npm registry connectivity, so lockfile generation could not be completed without fabricating dependency-resolution data. The Dockerfiles therefore use `npm install` rather than claiming a lockfile-backed `npm ci` build.

Release procedure:

```text
npm install
npm audit
commit backend/package-lock.json
commit frontend/package-lock.json
change Dockerfiles/deployment to npm ci
```

Do not treat this repository as dependency-lock certified until those two lockfiles are committed and CI is changed to consume them.
