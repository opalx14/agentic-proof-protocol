import ProofPage from '../../../src/ProofPage';

export default async function VerifyActionPage({
  params,
}: {
  params: Promise<{ actionId: string }>;
}) {
  const { actionId } = await params;
  return <ProofPage actionId={actionId} />;
}
