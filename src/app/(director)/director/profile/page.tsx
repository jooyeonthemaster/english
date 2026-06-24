import AccountTab from "../settings/account-tab";

export default function DirectorProfilePage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-[20px] font-bold text-foreground">내 프로필</h1>
        <p className="mt-0.5 text-[13px] text-muted-foreground">
          이름, 직함, 연락처와 학원 표시 정보를 관리합니다
        </p>
      </div>

      <AccountTab />
    </div>
  );
}
