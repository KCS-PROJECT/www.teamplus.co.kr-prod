import { ClassesListView } from "../ClassesListView";

// 종료된 훈련·대회 이력 — 선택 자녀가 참여했던 것만. 진입은 /classes 목록 끝의 링크.
export default function EndedClassesPage() {
  return <ClassesListView mode="ended" />;
}
