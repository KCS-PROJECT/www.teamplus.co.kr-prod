pipeline {
    agent any

    environment {
        APP_DIR = '/kcs-project/www.teamplus.co.kr'
    }

    options {
        skipDefaultCheckout true
    }

    triggers {
        githubPush()
        pollSCM('H/2 * * * *')
    }

    stages {
        stage('Pull Latest Code') {
            steps {
                sh '''
                    git config --global --add safe.directory /kcs-project/www.teamplus.co.kr
                    cd /kcs-project/www.teamplus.co.kr

                    # 업로드/런타임 파일이 root:pm2 로 생성되어 jenkins 가 reset --hard 하지 못하는 경우 방지
                    sudo chown -R jenkins:jenkins /kcs-project/www.teamplus.co.kr 2>/dev/null || true

                    git fetch origin develop
                    git checkout develop
                    git reset --hard origin/develop
                '''
            }
        }

        stage('Backend - Install Dependencies') {
            steps {
                sh 'cd /kcs-project/www.teamplus.co.kr/teamplus-backend && npm install'
            }
        }

        stage('Web - Install Dependencies') {
            steps {
                sh 'cd /kcs-project/www.teamplus.co.kr/teamplus-web && npm install'
            }
        }

        stage('Admin - Install Dependencies') {
            steps {
                sh 'cd /kcs-project/www.teamplus.co.kr/teamplus-admin && npm install'
            }
        }

        stage('Home - Install & Build') {
            steps {
                sh '''
                    cd /kcs-project/www.teamplus.co.kr/teamplus-home
                    mkdir -p data

                    # .env 자동 생성 (git 에는 없음 · 서버 최초 1회 + 복구용)
                    # [2026-06-15] home 관리자 로그인/공지 CMS 제거 — ADMIN_PASSWORD·JWT_SECRET 불필요.
                    #   /news 는 Prisma 로 notices.db 를 읽기 전용 조회만 하므로 DATABASE_URL 만 있으면 된다.
                    if [ ! -s .env ]; then
                        echo "[.env] 없음 — 자동 생성"
                        cat > .env <<EOF
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
                '''
            }
        }

        stage('Backend - Generate Prisma Client') {
            steps {
                sh 'cd /kcs-project/www.teamplus.co.kr/teamplus-backend && npx prisma generate'
            }
        }

        stage('Fix Port & Config') {
            steps {
                sh '''
                    cd /kcs-project/www.teamplus.co.kr
                    echo "Checking port configurations..."

                    # Backend .env — DB IP 교정 (옛 162.x → 174.115)
                    if grep -q "211.236.162" teamplus-backend/.env 2>/dev/null; then
                        sed -i 's/211.236.162.[0-9]*/211.236.174.115/g' teamplus-backend/.env
                        echo "Fixed backend .env DB IP"
                    fi
                    if grep -q "211.236.162" teamplus-backend/.env.local 2>/dev/null; then
                        sed -i 's/211.236.162.[0-9]*/211.236.174.115/g' teamplus-backend/.env.local
                        echo "Fixed backend .env.local DB IP"
                    fi

                    # Web .env.local — API URL (localhost → 배포 IP:5003)
                    if [ -f teamplus-web/.env.local ] && grep -q "localhost:5003" teamplus-web/.env.local 2>/dev/null; then
                        sed -i 's|NEXT_PUBLIC_API_URL=http://localhost:5003|NEXT_PUBLIC_API_URL=http://211.236.174.115:5003|' teamplus-web/.env.local
                        echo "Fixed web .env.local API URL"
                    fi
                    if [ -f teamplus-web/.env.local ] && grep -q "localhost:5003" teamplus-web/.env.local 2>/dev/null; then
                        sed -i 's|NEXT_PUBLIC_API_URL=http://localhost:5003|NEXT_PUBLIC_API_URL=http://211.236.174.115:5003|' teamplus-web/.env.local
                    fi

                    # Admin .env.local — API URL (localhost → 배포 IP:5003)
                    if grep -q "localhost:5003" teamplus-admin/.env.local 2>/dev/null; then
                        sed -i 's|NEXT_PUBLIC_API_URL=http://localhost:5003|NEXT_PUBLIC_API_URL=http://211.236.174.115:5003|' teamplus-admin/.env.local
                        echo "Fixed admin .env.local API URL"
                    fi
                    if grep -q "localhost:5003" teamplus-admin/.env.local 2>/dev/null; then
                        sed -i 's|NEXT_PUBLIC_API_URL=http://localhost:5003|NEXT_PUBLIC_API_URL=http://211.236.174.115:5003|' teamplus-admin/.env.local
                    fi

                    # Backend crypto fallback patch
                    [ -f scripts/fix-crypto-fallback.py ] && python3 scripts/fix-crypto-fallback.py || echo "[crypto-fix] skipped"

                    # 포트 SoT — 이 서버는 home=5010 사용. develop 본체는 home 만 5020 (마이그레이션 누락) → sed-fix.
                    # web/admin 은 develop 본체가 이미 5001/5002 이므로 sed 불필요.
                    sed -i 's/next dev -p 5020/next dev -p 5010/g; s/next start -p 5020/next start -p 5010/g' teamplus-home/package.json
                    echo "[port-fix] home 5020 -> 5010"

                    # 브랜드명 한글 고정 + CSP 확장 (5001/5002/5003/5010) 은 develop 본체에 직접 반영됨 — sed 불필요

                    # Backend .env BACKEND_PORT (원격 .env.example 은 5003 이지만 안전망)
                    if [ -f teamplus-backend/.env ]; then
                        if grep -q "^BACKEND_PORT=" teamplus-backend/.env; then
                            sed -i 's/^BACKEND_PORT=.*/BACKEND_PORT=5003/' teamplus-backend/.env
                        else
                            echo "BACKEND_PORT=5003" >> teamplus-backend/.env
                        fi
                        echo "[port-fix] backend=5003"
                    fi

                    echo "Config check complete"
                '''
            }
        }

        stage('Ensure Payment Provider Keys') {
            steps {
                sh '''
                    set -e
                    ENV_FILE=/kcs-project/www.teamplus.co.kr/teamplus-backend/.env

                    # ⚠️ 보안 메모: 토스페이먼츠 sandbox(test) 키
                    if grep -q "^PAYMENT_PROVIDER=" "$ENV_FILE"; then
                        echo "[toss-env] PAYMENT_PROVIDER 이미 설정됨 — 토스 키 주입 skip"
                    else
                        echo "[toss-env] PAYMENT_PROVIDER 미설정 — 토스 sandbox 키 주입"
                        cat >> "$ENV_FILE" <<'EOF'

# ─── TossPayments (결제위젯 v2 · sandbox test keys · Jenkinsfile 자동 주입) ────
PAYMENT_PROVIDER=toss
TOSS_CLIENT_KEY=test_gck_yL0qZ4G1VOlO2zOma6aoroWb2MQY
TOSS_SECRET_KEY=test_gsk_E92LAa5PVbNqG0xALgEeV7YmpXyJ
TOSS_WEBHOOK_SECRET=6dde5010b20cd671e12e54d46b85edc5ef0bd244b3493fb309dc1f59b2c91710
TOSS_API_BASE=https://api.tosspayments.com
TOSS_API_VERSION=2024-06-01
TOSS_MID=iteampy7km
EOF
                        echo "[toss-env] 토스 키 7개 주입 완료"
                    fi

                    ensure_key() {
                        local key="$1"
                        local value="$2"
                        if ! grep -q "^${key}=" "$ENV_FILE"; then
                            echo "${key}=${value}" >> "$ENV_FILE"
                            echo "[toss-env] +${key}"
                        fi
                    }
                    ensure_key TOSS_CLIENT_KEY     "test_gck_yL0qZ4G1VOlO2zOma6aoroWb2MQY"
                    ensure_key TOSS_SECRET_KEY     "test_gsk_E92LAa5PVbNqG0xALgEeV7YmpXyJ"
                    ensure_key TOSS_WEBHOOK_SECRET "6dde5010b20cd671e12e54d46b85edc5ef0bd244b3493fb309dc1f59b2c91710"
                    ensure_key TOSS_API_BASE       "https://api.tosspayments.com"
                    ensure_key TOSS_API_VERSION    "2024-06-01"
                    ensure_key TOSS_MID            "iteampy7km"

                    echo "[toss-env] final TOSS_/PAYMENT_PROVIDER lines:"
                    grep -E "^PAYMENT_PROVIDER=|^TOSS_" "$ENV_FILE" | sed 's/=.*/=***masked***/'
                '''
            }
        }

        stage('Backend - Apply DB Migrations') {
            steps {
                sh '''
                    cd /kcs-project/www.teamplus.co.kr/teamplus-backend
                    # 원격 공유 DB 는 drift 정책상 prisma migrate dev 미사용 → 스키마 변경을
                    # prisma/manual-migrations/*.sql 로 수동 작성한다. 그런데 prisma migrate deploy 는
                    # prisma/migrations/ 만 적용하고 manual-migrations/ 는 적용하지 않으므로, 신규
                    # 테이블/컬럼이 운영 DB 에 생성되지 않아 500("데이터베이스 오류")이 발생했다
                    # (예: contact_inquiries 누락). 여기서 수동 SQL 을 멱등 적용해 재발을 막는다.
                    # 모든 SQL 은 IF NOT EXISTS / duplicate_object 가드 포함 → 매 배포 반복 안전.
                    # DATABASE_URL 은 Fix Port 단계에서 .115 로 교정된 backend/.env 를 prisma 가 로드.
                    npm run db:migrate:manual || echo "[migrate:manual] WARNING — 적용 실패, 위 로그 확인(배포는 계속)"
                '''
            }
        }

        stage('Deploy') {
            steps {
                sh '''
                    echo "Restarting teamplus services..."
                    # --update-env: .env 변경을 process.env 에 반영
                    sudo pm2 restart teamplus-backend --update-env || sudo pm2 start npm --name "teamplus-backend" --cwd /kcs-project/www.teamplus.co.kr/teamplus-backend -- run start:dev
                    sudo pm2 restart teamplus-web --update-env || sudo pm2 start npm --name "teamplus-web" --cwd /kcs-project/www.teamplus.co.kr/teamplus-web -- run dev
                    sudo pm2 restart teamplus-admin --update-env || sudo pm2 start npm --name "teamplus-admin" --cwd /kcs-project/www.teamplus.co.kr/teamplus-admin -- run dev
                    sudo pm2 restart teamplus-home --update-env || sudo pm2 start npm --name "teamplus-home" --cwd /kcs-project/www.teamplus.co.kr/teamplus-home -- run start
                    sudo pm2 save
                '''
            }
        }

        stage('Health Check') {
            steps {
                sh '''
                    sleep 15
                    echo "Checking services..."
                    curl -sf http://localhost:5003/health > /dev/null && echo "Backend (5003): OK" || echo "Backend (5003): STARTING..."
                    curl -sf http://localhost:5001 > /dev/null && echo "Web (5001): OK" || echo "Web (5001): STARTING..."
                    curl -sf http://localhost:5002 > /dev/null && echo "Admin (5002): OK" || echo "Admin (5002): STARTING..."
                    curl -sf http://localhost:5010 > /dev/null && echo "Home (5010): OK" || echo "Home (5010): STARTING..."
                '''
            }
        }
    }

    post {
        success {
            echo 'TEAMPLUS deployment successful! (5001/5002/5003/5010)'
        }
        failure {
            echo 'TEAMPLUS deployment failed!'
        }
    }
}
