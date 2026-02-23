import { Routes, Route, Navigate } from "react-router-dom";
import { AppLayout } from "@/components/AppLayout";
import { WorkflowPage } from "@/pages/WorkflowPage";
import { RunsPage } from "@/pages/RunsPage";
import { RunDetailPage } from "@/pages/RunDetailPage";
import { MutationsPage } from "@/pages/MutationsPage";
import { MutationDetailPage } from "@/pages/MutationDetailPage";
import { ArtifactSchemaPage } from "@/pages/ArtifactSchemaPage";

function App() {
  return (
    <Routes>
      <Route path="/" element={<AppLayout />}>
        <Route index element={<WorkflowPage />} />
        <Route path="workflow" element={<WorkflowPage />} />
        <Route path="runs" element={<RunsPage />} />
        <Route path="runs/:runId" element={<RunDetailPage />} />
        <Route path="mutations" element={<MutationsPage />} />
        <Route path="mutations/:mutationId" element={<MutationDetailPage />} />
        <Route path="artifact-schema" element={<ArtifactSchemaPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}

export default App;
