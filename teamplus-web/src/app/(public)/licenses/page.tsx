'use client';

import { useMemo, useState } from 'react';
import { MobileContainer } from '@/components/layout/MobileContainer';
import { PageAppBar } from '@/components/layout/PageAppBar';
import { Icon } from '@/components/ui/Icon';
import { usePageReady } from '@/hooks/usePageReady';
import { useDefaultUI } from '@/hooks/useNativeUI';
import ossData from '@/lib/legal/oss-licenses.generated.json';

/**
 * 오픈소스 라이선스 고지 페이지
 * Route: /licenses  (공개 — 비로그인 접근 가능)
 *
 * Apache-2.0 §4(d) 는 NOTICE 포함을, MIT·BSD·ISC 계열은 저작권 고지와 라이선스 전문
 * 포함을 요구한다. 배포되는 production 의존성의 고지가 없으면 attribution 조건을
 * 충족하지 못하므로 공개 경로에 고지 화면을 둔다.
 *
 * 목록 데이터는 `scripts/generate-oss-licenses.mjs` 가 각 프로젝트의 실제
 * production dependencies 에서 추출한다(devDependencies 는 배포물에 없어 제외).
 * 의존성 변경 후에는 스크립트를 재실행해 갱신한다.
 *
 * 정적 문서이므로 DB fetch 없이 자체완결.
 */

/** 전문이 짧아 본문에 그대로 실을 수 있는 라이선스. 긴 것은 공식 URL 로 안내한다. */
const LICENSE_TEXTS: Record<string, string> = {
  MIT: `Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.`,

  ISC: `Permission to use, copy, modify, and/or distribute this software for any purpose with or without fee is hereby granted, provided that the above copyright notice and this permission notice appear in all copies.

THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.`,

  'BSD-2-Clause': `Redistribution and use in source and binary forms, with or without modification, are permitted provided that the following conditions are met:

1. Redistributions of source code must retain the above copyright notice, this list of conditions and the following disclaimer.

2. Redistributions in binary form must reproduce the above copyright notice, this list of conditions and the following disclaimer in the documentation and/or other materials provided with the distribution.

THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.`,

  'BSD-3-Clause': `Redistribution and use in source and binary forms, with or without modification, are permitted provided that the following conditions are met:

1. Redistributions of source code must retain the above copyright notice, this list of conditions and the following disclaimer.

2. Redistributions in binary form must reproduce the above copyright notice, this list of conditions and the following disclaimer in the documentation and/or other materials provided with the distribution.

3. Neither the name of the copyright holder nor the names of its contributors may be used to endorse or promote products derived from this software without specific prior written permission.

THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.`,
};

/** 전문이 길어 공식 원문 URL 로 안내하는 라이선스. */
const LICENSE_URLS: Record<string, string> = {
  'Apache-2.0': 'https://www.apache.org/licenses/LICENSE-2.0',
  'MPL-2.0': 'https://www.mozilla.org/en-US/MPL/2.0/',
  'BlueOak-1.0.0': 'https://blueoakcouncil.org/license/1.0.0',
  'CC-BY-4.0': 'https://creativecommons.org/licenses/by/4.0/legalcode',
  '0BSD': 'https://opensource.org/license/0bsd',
  'MIT-0': 'https://opensource.org/license/mit-0',
  'Python-2.0': 'https://docs.python.org/3/license.html',
  'FSL-1.1-MIT': 'https://fsl.software/',
};

const FONT_LICENSE = {
  name: 'Pretendard',
  copyright: 'Copyright (c) 2021, Kil Hyung-jin, with Reserved Font Name Pretendard',
  license: 'SIL Open Font License 1.1',
  url: 'https://scripts.sil.org/OFL',
  localPath: '/fonts/OFL.txt',
};

export default function LicensesPage() {
  usePageReady(true); // 정적 페이지 — 마운트 즉시 ready
  useDefaultUI();

  const [expanded, setExpanded] = useState(false);
  const [query, setQuery] = useState('');

  const summary = useMemo(
    () => Object.entries(ossData.licenseSummary).sort((a, b) => b[1] - a[1]),
    [],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return ossData.packages;
    return ossData.packages.filter(
      (p) =>
        p.name.toLowerCase().includes(q) || p.license.toLowerCase().includes(q),
    );
  }, [query]);

  const visible = expanded ? filtered : filtered.slice(0, 30);

  return (
    <MobileContainer hasBottomNav className="selectable-text">
      <PageAppBar title="오픈소스 라이선스" forceNative />

      <main className="flex-1 overflow-y-auto bg-it-canvas dark:bg-puck">
        {/* 안내 */}
        <section className="bg-it-surface dark:bg-rink-800 mt-2 px-5 pt-5 pb-5 space-y-3">
          <h2 className="text-[17px] font-extrabold tracking-[-0.02em] text-it-ink-800 dark:text-white">
            오픈소스 소프트웨어 고지
          </h2>
          <p className="text-[14px] text-it-ink-500 dark:text-wtext-4 leading-relaxed">
            TEAMPLUS 는 아래의 오픈소스 소프트웨어를 사용하고 있으며, 각 소프트웨어의 라이선스
            조건에 따라 저작권 및 라이선스 정보를 고지합니다. 목록은 서비스에 실제로 배포되는
            구성요소를 기준으로 작성되었습니다.
          </p>
          <p className="text-[13px] text-it-ink-400 dark:text-wtext-4 leading-relaxed">
            총 {ossData.totalPackages.toLocaleString()}개 구성요소
          </p>
        </section>

        {/* 폰트 */}
        <section className="bg-it-surface dark:bg-rink-800 mt-2 px-5 pt-5 pb-5">
          <div className="flex items-center gap-2 mb-3">
            <Icon name="file" className="text-it-blue-500 text-card-emphasis" aria-hidden="true" />
            <h3 className="text-[15px] font-bold text-it-ink-800 dark:text-white">글꼴</h3>
          </div>
          <div className="rounded-w-lg bg-it-fill dark:bg-rink-700 px-4 py-3.5 space-y-1.5">
            <p className="text-[14px] font-semibold text-it-ink-800 dark:text-white">
              {FONT_LICENSE.name}
            </p>
            <p className="text-[13px] text-it-ink-500 dark:text-wtext-4 leading-relaxed">
              {FONT_LICENSE.copyright}
            </p>
            <p className="text-[13px] text-it-ink-500 dark:text-wtext-4">
              {FONT_LICENSE.license}
            </p>
            <a
              href={FONT_LICENSE.localPath}
              target="_blank"
              rel="noreferrer"
              className="inline-block text-[13px] font-semibold text-it-blue-500 underline"
            >
              라이선스 전문 보기
            </a>
          </div>
        </section>

        {/* 라이선스 종류별 요약 */}
        <section className="bg-it-surface dark:bg-rink-800 mt-2 px-5 pt-5 pb-5">
          <div className="flex items-center gap-2 mb-3">
            <Icon name="shield" className="text-it-blue-500 text-card-emphasis" aria-hidden="true" />
            <h3 className="text-[15px] font-bold text-it-ink-800 dark:text-white">
              라이선스 종류
            </h3>
          </div>
          <ul className="space-y-2">
            {summary.map(([license, count]) => (
              <li
                key={license}
                className="flex items-center justify-between rounded-w-lg bg-it-fill dark:bg-rink-700 px-4 py-3"
              >
                <span className="text-[14px] font-medium text-it-ink-800 dark:text-white break-all">
                  {license}
                </span>
                <span className="text-[13px] font-semibold text-it-ink-500 dark:text-wtext-4 shrink-0 ml-3">
                  {count}개
                </span>
              </li>
            ))}
          </ul>
        </section>

        {/* 구성요소 목록 */}
        <section className="bg-it-surface dark:bg-rink-800 mt-2 px-5 pt-5 pb-5">
          <div className="flex items-center gap-2 mb-3">
            <Icon name="package" className="text-it-blue-500 text-card-emphasis" aria-hidden="true" />
            <h3 className="text-[15px] font-bold text-it-ink-800 dark:text-white">구성요소</h3>
          </div>

          <label className="block mb-3">
            <span className="sr-only">구성요소 검색</span>
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="이름 또는 라이선스로 검색"
              className="w-full rounded-w-lg bg-it-fill dark:bg-rink-700 px-4 py-3 text-[14px] text-it-ink-800 dark:text-white placeholder:text-it-ink-400 dark:placeholder:text-wtext-4 outline-none focus:ring-2 focus:ring-it-blue-500"
            />
          </label>

          {filtered.length === 0 ? (
            <p className="text-[14px] text-it-ink-500 dark:text-wtext-4 py-6 text-center">
              검색 결과가 없습니다.
            </p>
          ) : (
            <>
              <ul className="space-y-2">
                {visible.map((p) => (
                  <li
                    key={`${p.name}@${p.version}`}
                    className="rounded-w-lg bg-it-fill dark:bg-rink-700 px-4 py-3 space-y-1"
                  >
                    <p className="text-[14px] font-semibold text-it-ink-800 dark:text-white break-all">
                      {p.name}
                      <span className="ml-1.5 font-normal text-it-ink-400 dark:text-wtext-4">
                        {p.version}
                      </span>
                    </p>
                    <p className="text-[13px] text-it-ink-500 dark:text-wtext-4 break-all">
                      {p.license}
                      {p.author ? ` · ${p.author}` : ''}
                    </p>
                  </li>
                ))}
              </ul>

              {filtered.length > 30 && (
                <button
                  type="button"
                  onClick={() => setExpanded((v) => !v)}
                  className="mt-3 w-full rounded-w-lg bg-it-fill dark:bg-rink-800 py-3 text-[14px] font-semibold text-it-ink-600 dark:text-rink-100 transition-colors motion-reduce:transition-none hover:bg-it-line dark:hover:bg-rink-700 active:brightness-95"
                >
                  {expanded
                    ? '접기'
                    : `전체 ${filtered.length.toLocaleString()}개 보기`}
                </button>
              )}
            </>
          )}
        </section>

        {/* 라이선스 전문 */}
        <section className="bg-it-surface dark:bg-rink-800 mt-2 px-5 pt-5 pb-8">
          <div className="flex items-center gap-2 mb-3">
            <Icon name="file" className="text-it-blue-500 text-card-emphasis" aria-hidden="true" />
            <h3 className="text-[15px] font-bold text-it-ink-800 dark:text-white">
              라이선스 전문
            </h3>
          </div>

          <div className="space-y-3">
            {Object.entries(LICENSE_TEXTS).map(([name, text]) => (
              <details
                key={name}
                className="rounded-w-lg bg-it-fill dark:bg-rink-700 px-4 py-3"
              >
                <summary className="cursor-pointer text-[14px] font-semibold text-it-ink-800 dark:text-white">
                  {name}
                </summary>
                <p className="mt-3 whitespace-pre-wrap text-[12px] leading-relaxed text-it-ink-500 dark:text-wtext-4">
                  {text}
                </p>
              </details>
            ))}
          </div>

          <p className="mt-4 mb-2 text-[13px] font-semibold text-it-ink-800 dark:text-white">
            원문 링크로 제공되는 라이선스
          </p>
          <ul className="space-y-1.5">
            {Object.entries(LICENSE_URLS).map(([name, url]) => (
              <li key={name} className="text-[13px] leading-relaxed">
                <span className="text-it-ink-800 dark:text-white font-medium">{name}</span>
                <span className="text-it-ink-400 dark:text-wtext-4"> — </span>
                <a
                  href={url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-it-blue-500 underline break-all"
                >
                  {url}
                </a>
              </li>
            ))}
          </ul>
        </section>
      </main>
    </MobileContainer>
  );
}
