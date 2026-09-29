import { ClassesListView } from "./ClassesListView";

// 학부모 훈련·대회 목록(진행 중). 뷰 본문은 ClassesListView — /classes/ended 와 공유.
export default function ClassesPage() {
  return <ClassesListView mode="active" />;
}
