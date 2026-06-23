#!/bin/bash
keytool -genkey -v -keystore keystore/teamplus-release.jks \
  -keyalg RSA -keysize 2048 -validity 10000 \
  -alias teamplus-release \
  -dname "CN=TEAMPLUS, OU=Mobile, O=TEAMPLUS, L=Seoul, ST=Seoul, C=KR"
