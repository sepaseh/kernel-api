import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { parseDocument } from "yaml";

import {
  operationsRequiredFiles,
  operationsWorkflowPaths,
  validateOperationsWorkflows,
} from "./check-operations-policy.mjs";

const filename = (name) => `.github/workflows/${name}.yml`;
const workflows = Object.fromEntries(
  operationsWorkflowPaths.map((file) => {
    const document = parseDocument(
      readFileSync(new URL(`../${file}`, import.meta.url), "utf8"),
      { uniqueKeys: true },
    );
    assert.deepEqual(document.errors, []);
    return [file, document.toJS()];
  }),
);
const publishedFiles = () => new Set(operationsRequiredFiles);
const rejectsMutation = (name, mutate) => {
  test(name, () => {
    const changed = structuredClone(workflows);
    mutate(changed);

    assert.throws(
      () => validateOperationsWorkflows(changed, publishedFiles()),
      /[Oo]perations/,
    );
  });
};

test("reviewed operations definitions preserve manual authorization and allowed CodeQL analysis", () => {
  assert.doesNotThrow(() =>
    validateOperationsWorkflows(workflows, publishedFiles()),
  );
});

test("equivalent manual-dispatch and explicit read-only job declarations are accepted", () => {
  const changed = structuredClone(workflows);
  changed[filename("release")].on.workflow_dispatch = {};
  changed[filename("codeql")].on.workflow_dispatch = {};
  changed[filename("dast")].jobs.zap.permissions = { contents: "read" };
  changed[filename("staging")].jobs.verify.permissions = { contents: "read" };
  changed[filename("deployment-smoke")].jobs.verify.permissions = {
    contents: "read",
  };

  assert.doesNotThrow(() =>
    validateOperationsWorkflows(changed, publishedFiles()),
  );
});

for (const file of operationsRequiredFiles)
  test(`operations publication cannot omit ${file}`, () => {
    const files = publishedFiles();
    files.delete(file);

    assert.throws(
      () => validateOperationsWorkflows(workflows, files),
      /publish every workflow, configuration, enforcing owner and test/,
    );
  });

for (const file of operationsWorkflowPaths) {
  rejectsMutation(`operations definitions cannot omit ${file}`, (changed) => {
    delete changed[file];
  });
  rejectsMutation(
    `${file} cannot acquire root write permissions`,
    (changed) => {
      changed[file].permissions.contents = "write";
    },
  );
  rejectsMutation(
    `${file} cannot inject a separate deployment job`,
    (changed) => {
      changed[file].jobs.deploy = {
        "runs-on": "ubuntu-latest",
        steps: [{ run: "synthetic-deploy-command" }],
      };
    },
  );
}

rejectsMutation(
  "unreviewed extra workflow definitions require a policy transition",
  (changed) => {
    changed[filename("unreviewed")] = structuredClone(
      changed[filename("release")],
    );
  },
);

for (const name of ["dast", "staging", "deployment-smoke", "release"])
  for (const event of ["push", "pull_request", "schedule", "workflow_run"])
    rejectsMutation(
      `${name} cannot run automatically through ${event}`,
      (changed) => {
        changed[filename(name)].on[event] = {};
      },
    );

const mutationCases = [
  [
    "DAST cannot skip explicit target input",
    (changed) => {
      changed[
        filename("dast")
      ].on.workflow_dispatch.inputs.target_url.required = false;
    },
  ],
  [
    "DAST cannot target a different environment",
    (changed) => {
      changed[filename("dast")].jobs.zap.environment = "production";
    },
  ],
  [
    "DAST cannot bypass the configured production-host guard",
    (changed) => {
      delete changed[filename("dast")].jobs.zap.env.DAST_PRODUCTION_HOST;
    },
  ],
  [
    "DAST cannot use a literal unconfigured host",
    (changed) => {
      changed[filename("dast")].jobs.zap.env.DAST_ALLOWED_HOST =
        "synthetic.example";
    },
  ],
  [
    "DAST cannot retain checkout credentials",
    (changed) => {
      changed[filename("dast")].jobs.zap.steps[0].with["persist-credentials"] =
        true;
    },
  ],
  [
    "DAST cannot introduce a checkout token override",
    (changed) => {
      changed[filename("dast")].jobs.zap.steps[0].with.token =
        "synthetic-token";
    },
  ],
  [
    "DAST cannot replace immutable action pins with tags",
    (changed) => {
      changed[filename("dast")].jobs.zap.steps[0].uses =
        "actions/checkout@main";
    },
  ],
  [
    "DAST cannot omit pinned Node setup",
    (changed) => {
      changed[filename("dast")].jobs.zap.steps.splice(1, 1);
    },
  ],
  [
    "DAST cannot use an ambient or alternate Node version",
    (changed) => {
      changed[filename("dast")].jobs.zap.steps[1].with = {
        "node-version": "22",
      };
    },
  ],
  [
    "DAST cannot invoke the network scanner before its target validator",
    (changed) => {
      changed[filename("dast")].jobs.zap.steps.reverse();
    },
  ],
  [
    "DAST cannot make target validation conditional",
    (changed) => {
      changed[filename("dast")].jobs.zap.steps[2].if = "false";
    },
  ],
  [
    "DAST cannot silence validator failures",
    (changed) => {
      changed[filename("dast")].jobs.zap.steps[2]["continue-on-error"] = true;
    },
  ],
  [
    "DAST cannot run an additional unguarded command",
    (changed) => {
      changed[filename("dast")].jobs.zap.steps[2].run +=
        "\nsynthetic-network-command";
    },
  ],
  [
    "DAST cannot create remote issues",
    (changed) => {
      changed[filename("dast")].jobs.zap.steps[3].with.allow_issue_writing =
        true;
    },
  ],
  [
    "DAST cannot ignore scan failures",
    (changed) => {
      changed[filename("dast")].jobs.zap.steps[3].with.fail_action = false;
    },
  ],
  [
    "DAST cannot pull a mutable scanner image",
    (changed) => {
      changed[filename("dast")].jobs.zap.steps[3].with.docker_name =
        "ghcr.io/zaproxy/zaproxy:latest";
    },
  ],
  [
    "DAST cannot replace the validated scanner target",
    (changed) => {
      changed[filename("dast")].jobs.zap.steps[3].with.target =
        "https://synthetic.example";
    },
  ],
  [
    "staging cannot replace its configured host guard",
    (changed) => {
      changed[filename("staging")].jobs.verify.env.API_ALLOWED_HOST =
        "synthetic.example";
    },
  ],
  [
    "smoke cannot skip the protected deployment marker",
    (changed) => {
      delete changed[filename("deployment-smoke")].jobs.verify.env
        .EXPECTED_DEPLOYMENT_ID;
    },
  ],
  [
    "smoke cannot run the staging command under a different authorization scope",
    (changed) => {
      changed[filename("deployment-smoke")].jobs.verify.steps[2].run =
        "node scripts/check-deployed-api.mjs staging";
    },
  ],
  [
    "verification cannot elevate token privileges",
    (changed) => {
      changed[filename("staging")].jobs.verify.permissions = {
        contents: "write",
      };
    },
  ],
  [
    "verification cannot inject a custom shell or working directory",
    (changed) => {
      changed[filename("staging")].jobs.verify.defaults = {
        run: { shell: "bash", "working-directory": "other" },
      };
    },
  ],
  [
    "release cannot run without the main-only condition",
    (changed) => {
      delete changed[filename("release")].jobs.release.if;
    },
  ],
  [
    "release cannot broaden its main-only condition",
    (changed) => {
      changed[filename("release")].jobs.release.if =
        "github.ref != 'refs/heads/unrelated'";
    },
  ],
  [
    "release cannot grant write privileges outside its job",
    (changed) => {
      changed[filename("release")].permissions = {
        contents: "write",
        "pull-requests": "write",
      };
    },
  ],
  [
    "release cannot request unrelated write permissions",
    (changed) => {
      changed[filename("release")].jobs.release.permissions.issues = "write";
    },
  ],
  [
    "release cannot use alternate unreviewed configuration",
    (changed) => {
      changed[filename("release")].jobs.release.steps[0].with["config-file"] =
        "other.json";
    },
  ],
  [
    "CodeQL cannot gain contents write privileges",
    (changed) => {
      changed[filename("codeql")].jobs.analyze.permissions.contents = "write";
    },
  ],
  [
    "CodeQL cannot omit its security-report permission",
    (changed) => {
      delete changed[filename("codeql")].jobs.analyze.permissions[
        "security-events"
      ];
    },
  ],
  [
    "CodeQL cannot silently narrow its published source checks",
    (changed) => {
      changed[filename("codeql")].jobs.analyze.steps[1].with.languages =
        "python";
    },
  ],
  [
    "CodeQL cannot add a changed-path skip",
    (changed) => {
      changed[filename("codeql")].on.pull_request.paths = ["unrelated/**"];
    },
  ],
];
for (const [name, mutate] of mutationCases) rejectsMutation(name, mutate);
