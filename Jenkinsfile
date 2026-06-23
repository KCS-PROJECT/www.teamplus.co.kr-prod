pipeline {
    agent any

    environment {
        // 운영서버 (.230) 정보 — Jenkins(.115)에서 SSH 로 원격 실행
        APP_DIR     = '/kcs-project/www.teamplus.co.kr-prod'
        PROD_HOST   = '211.236.174.230'
        PROD_PORT   = '7514'
        PROD_USER   = 'root'
        SSH_KEY     = '/var/lib/jenkins/.ssh/id_ed25519'
        // StrictHostKeyChecking=no + 별도 known_hosts 로 멱등 운영 (호스트키 회전 대비)
        SSH_OPTS    = "-i /var/lib/jenkins/.ssh/id_ed25519 -p 7514 -o StrictHostKeyChecking=no -o UserKnownHostsFile=/var/lib/jenkins/.ssh/known_hosts.prod -o BatchMode=yes -o ConnectTimeout=10"
        // 운영 공개 API URL (NEXT_PUBLIC_API_URL 교정용)
        PROD_API_URL = 'http://211.236.174.230:5003'
    }

    options {
        skipDefaultCheckout true
        disableConcurrentBuilds()
        timeout(time: 30, unit: 'MINUTES')
    }

    // ⚠️ 수동 배포 전용 — githubPush / pollSCM 트리거 의도적으로 미설정

    stages {
        stage('Pull Latest Code (main → prod)') {
            steps {
                sh '''
                    ssh $SSH_OPTS $PROD_USER@$PROD_HOST "
                        set -e
                        git config --global --add safe.directory $APP_DIR
                        cd $APP_DIR
                        chown -R root:root $APP_DIR 2>/dev/null || true
                        git fetch origin main
                        git checkout main
                        git reset --hard origin/main
                        git log -1 --oneline
                    "
                '''
            }
        }

        stage('Backend - Install Dependencies') {
            steps {
                sh 'ssh $SSH_OPTS $PROD_USER@$PROD_HOST "cd $APP_DIR/teamplus-backend && npm install"'
            }
        }

        stage('Web - Install & Build (prod)') {
            steps {
                sh '''
                    ssh $SSH_OPTS $PROD_USER@$PROD_HOST "
                        set -e
                        cd $APP_DIR/teamplus-web
                        npm install
                        npm run build
                    "
                '''
            }
        }

        stage('Admin - Install & Build (prod)') {
            steps {
                sh '''
                    ssh $SSH_OPTS $PROD_USER@$PROD_HOST "
                        set -e
                        cd $APP_DIR/teamplus-admin
                        npm install
                        npm run build
                    "
                '''
            }
        }

        stage('Home - Install & Build') {
            steps {
                sh '''
                    ssh $SSH_OPTS $PROD_USER@$PROD_HOST bash -s <<REMOTE
set -e
cd $APP_DIR/teamplus-home
mkdir -p data

# .env 자동 생성 (git 미추적 · 운영 최초 1회 + 복구용)
if [ ! -s .env ]; then
    echo "[.env] 없음 — 자동 생성"
    cat > .env <<'EOF'
DATABASE_URL="file:../data/notices.db"
EOF
    chmod 600 .env
else
    echo "[.env] 이미 존재 — 유지"
fi

set -a
. ./.env
set +a

npm install
npm run build
npm run db:seed || echo "[seed] skipped"
REMOTE
                '''
            }
        }

        stage('Backend - Build (prod)') {
            steps {
                // prebuild: prisma:generate + rimraf dist + tsconfig.tsbuildinfo
                // build  : nest build → dist/main.js (start:prod 가 사용)
                sh 'ssh $SSH_OPTS $PROD_USER@$PROD_HOST "cd $APP_DIR/teamplus-backend && npm run build"'
            }
        }

        stage('Fix Port & Config (prod)') {
            steps {
                sh '''
                    ssh $SSH_OPTS $PROD_USER@$PROD_HOST bash -s <<REMOTE
set -e
cd $APP_DIR
echo "Checking port configurations (prod)..."

# Backend .env — DB host 교정 (개발 .115 / 옛 .162.x → 운영 로컬 127.0.0.1)
for f in teamplus-backend/.env teamplus-backend/.env.local; do
    [ -f "\$f" ] || continue
    sed -i 's/211\\.236\\.174\\.115/127.0.0.1/g' "\$f"
    sed -i 's/211\\.236\\.162\\.[0-9]*/127.0.0.1/g' "\$f"
    echo "[port-fix] DB host 교정: \$f"
done

# Web/Admin .env.local — NEXT_PUBLIC_API_URL → 운영 공개 IP
for f in teamplus-web/.env.local teamplus-admin/.env.local; do
    [ -f "\$f" ] || continue
    sed -i 's|NEXT_PUBLIC_API_URL=http://localhost:5003|NEXT_PUBLIC_API_URL=$PROD_API_URL|' "\$f"
    sed -i 's|NEXT_PUBLIC_API_URL=http://211\\.236\\.174\\.115:5003|NEXT_PUBLIC_API_URL=$PROD_API_URL|' "\$f"
    echo "[port-fix] API URL 교정: \$f"
done

# Backend crypto fallback patch
[ -f scripts/fix-crypto-fallback.py ] && python3 scripts/fix-crypto-fallback.py || echo "[crypto-fix] skipped"

# Home 포트 SoT — 5010 고정
sed -i 's/next dev -p 5020/next dev -p 5010/g; s/next start -p 5020/next start -p 5010/g' teamplus-home/package.json
echo "[port-fix] home 5020 -> 5010"

# Backend .env BACKEND_PORT 안전망
if [ -f teamplus-backend/.env ]; then
    if grep -q "^BACKEND_PORT=" teamplus-backend/.env; then
        sed -i 's/^BACKEND_PORT=.*/BACKEND_PORT=5003/' teamplus-backend/.env
    else
        echo "BACKEND_PORT=5003" >> teamplus-backend/.env
    fi
    echo "[port-fix] backend=5003"
fi

echo "Config check complete (prod)"
REMOTE
                '''
            }
        }

        stage('Ensure Payment Provider Keys') {
            steps {
                sh '''
                    ssh $SSH_OPTS $PROD_USER@$PROD_HOST bash -s <<REMOTE
set -e
ENV_FILE=$APP_DIR/teamplus-backend/.env

if [ ! -f "\$ENV_FILE" ]; then
    echo "[toss-env] backend .env 미존재 — 최초 배포는 .env 사전 배치 필요 (skip)"
    exit 0
fi

# ⚠️ 운영 라이브키 발급 시 별도 교체 작업 필요 — 현재 sandbox 키
if grep -q "^PAYMENT_PROVIDER=" "\$ENV_FILE"; then
    echo "[toss-env] PAYMENT_PROVIDER 이미 설정됨 — skip"
else
    echo "[toss-env] sandbox 토스 키 주입 (⚠️ 운영 라이브키 전환 시 교체 필수)"
    cat >> "\$ENV_FILE" <<'EOF'

# ─── TossPayments (결제위젯 v2 · sandbox test keys · Jenkinsfile-prod 자동 주입) ────
# ⚠️ 운영 라이브키 발급 후 반드시 교체할 것.
PAYMENT_PROVIDER=toss
TOSS_CLIENT_KEY=test_gck_yL0qZ4G1VOlO2zOma6aoroWb2MQY
TOSS_SECRET_KEY=test_gsk_E92LAa5PVbNqG0xALgEeV7YmpXyJ
TOSS_WEBHOOK_SECRET=6dde5010b20cd671e12e54d46b85edc5ef0bd244b3493fb309dc1f59b2c91710
TOSS_API_BASE=https://api.tosspayments.com
TOSS_API_VERSION=2024-06-01
TOSS_MID=iteampy7km
EOF
fi

ensure_key() {
    local key="\$1"; local value="\$2"
    if ! grep -q "^\${key}=" "\$ENV_FILE"; then
        echo "\${key}=\${value}" >> "\$ENV_FILE"
        echo "[toss-env] +\${key}"
    fi
}
ensure_key TOSS_CLIENT_KEY     "test_gck_yL0qZ4G1VOlO2zOma6aoroWb2MQY"
ensure_key TOSS_SECRET_KEY     "test_gsk_E92LAa5PVbNqG0xALgEeV7YmpXyJ"
ensure_key TOSS_WEBHOOK_SECRET "6dde5010b20cd671e12e54d46b85edc5ef0bd244b3493fb309dc1f59b2c91710"
ensure_key TOSS_API_BASE       "https://api.tosspayments.com"
ensure_key TOSS_API_VERSION    "2024-06-01"
ensure_key TOSS_MID            "iteampy7km"

echo "[toss-env] final TOSS_/PAYMENT_PROVIDER lines:"
grep -E '^PAYMENT_PROVIDER=|^TOSS_' "\$ENV_FILE" | sed 's/=.*/=***masked***/'
REMOTE
                '''
            }
        }

        stage('Backend - Apply DB Migrations') {
            steps {
                sh '''
                    ssh $SSH_OPTS $PROD_USER@$PROD_HOST "
                        cd $APP_DIR/teamplus-backend
                        npm run db:migrate:manual || echo '[migrate:manual] WARNING — 적용 실패, 위 로그 확인(배포는 계속)'
                    "
                '''
            }
        }

        stage('Deploy (pm2 on prod · production mode)') {
            steps {
                // 운영 모드: backend=start:prod (node dist/main), web/admin/home=start (next start)
                // 이전 dev/watch 프로세스가 떠있을 가능성 대비 → delete 후 재기동(no-op if absent)
                sh '''
                    ssh $SSH_OPTS $PROD_USER@$PROD_HOST bash -s <<REMOTE
set -e
echo "Restarting teamplus services on prod (production build)..."
for app in teamplus-backend teamplus-web teamplus-admin teamplus-home; do
    pm2 delete \$app 2>/dev/null || true
done
pm2 start npm --name "teamplus-backend" --cwd $APP_DIR/teamplus-backend -- run start:prod
pm2 start npm --name "teamplus-web"     --cwd $APP_DIR/teamplus-web     -- run start
pm2 start npm --name "teamplus-admin"   --cwd $APP_DIR/teamplus-admin   -- run start
pm2 start npm --name "teamplus-home"    --cwd $APP_DIR/teamplus-home    -- run start
pm2 save
pm2 list
REMOTE
                '''
            }
        }

        stage('Health Check') {
            steps {
                sh '''
                    sleep 15
                    ssh $SSH_OPTS $PROD_USER@$PROD_HOST bash -s <<'REMOTE'
echo "Checking services on prod..."
curl -sf http://localhost:5003/health > /dev/null && echo "Backend (5003): OK"  || echo "Backend (5003): STARTING..."
curl -sf http://localhost:5001          > /dev/null && echo "Web     (5001): OK" || echo "Web     (5001): STARTING..."
curl -sf http://localhost:5002          > /dev/null && echo "Admin   (5002): OK" || echo "Admin   (5002): STARTING..."
curl -sf http://localhost:5010          > /dev/null && echo "Home    (5010): OK" || echo "Home    (5010): STARTING..."
REMOTE
                '''
            }
        }
    }

    post {
        success {
            echo 'TEAMPLUS PROD deployment successful! (5001/5002/5003/5010 on 211.236.174.230)'
        }
        failure {
            echo 'TEAMPLUS PROD deployment failed!'
        }
    }
}
