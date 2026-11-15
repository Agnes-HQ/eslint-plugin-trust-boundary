import plugin from "../src/index";
import { tester } from "./setup";

const rules = plugin.rules;
const cdk = 'import * as s3 from "aws-cdk-lib/aws-s3"; import * as ec2 from "aws-cdk-lib/aws-ec2"; import * as iam from "aws-cdk-lib/aws-iam";\n';
const pulumi = 'import * as aws from "@pulumi/aws";\n';

tester.run("no-public-bucket", rules["no-public-bucket"], {
  valid: [
    `${cdk}new s3.Bucket(this, "B", { publicReadAccess: false, blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL });`,
    `${pulumi}new aws.s3.BucketV2("b"); new aws.s3.BucketPublicAccessBlock("pab", { bucket: b.id, blockPublicAcls: true, blockPublicPolicy: true });`,
    { code: 'new sst.aws.Bucket("Assets", { access: "cloudfront" });', filename: "infra/storage.ts" },
    // not infrastructure code
    "const settings = { publicReadAccess: true, acl: 'public-read' };",
  ],
  invalid: [
    { code: `${cdk}new s3.Bucket(this, "B", { publicReadAccess: true });`, errors: [{ messageId: "public" }] },
    { code: `${cdk}new s3.Bucket(this, "B", { accessControl: s3.BucketAccessControl.PUBLIC_READ });`, errors: 1 },
    { code: `${cdk}new s3.Bucket(this, "B", { blockPublicAccess: new s3.BlockPublicAccess({ blockPublicPolicy: false, restrictPublicBuckets: false }) });`, errors: [{ messageId: "unblocked", data: { name: "blockPublicPolicy" } }] },
    { code: `${pulumi}new aws.s3.BucketAclV2("acl", { bucket: b.id, acl: "public-read" });`, errors: 1 },
    { code: 'new sst.aws.Bucket("Uploads", { access: "public" });', filename: "infra/storage.ts", errors: 1 },
    { code: 'export default $config({ async run() { new sst.aws.Bucket("U", { access: "public" }); } });', filename: "sst.config.ts", errors: 1 },
  ],
});

tester.run("no-wildcard-iam", rules["no-wildcard-iam"], {
  valid: [
    `${cdk}new iam.PolicyStatement({ actions: ["s3:GetObject"], resources: ["*"] });`,
    `${cdk}new iam.PolicyStatement({ actions: ["*"], resources: [bucket.arnForObjects("*")] });`,
    `${cdk}new iam.PolicyStatement({ effect: iam.Effect.DENY, actions: ["*"], resources: ["*"] });`,
    `${pulumi}const doc = { Statement: [{ Effect: "Deny", Action: "*", Resource: "*" }] };`,
  ],
  invalid: [
    { code: `${cdk}new iam.PolicyStatement({ actions: ["*"], resources: ["*"] });`, errors: [{ messageId: "wildcard" }] },
    { code: `${pulumi}new aws.iam.RolePolicy("p", { policy: JSON.stringify({ Version: "2012-10-17", Statement: [{ Effect: "Allow", Action: "*", Resource: "*" }] }) });`, errors: 1 },
    { code: 'new sst.aws.Function("Api", { handler: "api.handler", permissions: [{ actions: ["*"], resources: ["*"] }] });', filename: "infra/api.ts", errors: 1 },
  ],
});

tester.run("no-open-ingress", rules["no-open-ingress"], {
  valid: [
    `${cdk}sg.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(443));`,
    `${cdk}sg.addIngressRule(ec2.Peer.ipv4("10.0.0.0/16"), ec2.Port.tcp(5432));`,
    `${pulumi}new aws.ec2.SecurityGroup("web", { ingress: [{ protocol: "tcp", fromPort: 80, toPort: 80, cidrBlocks: ["0.0.0.0/0"] }], egress: [{ protocol: "-1", fromPort: 0, toPort: 0, cidrBlocks: ["0.0.0.0/0"] }] });`,
    `${pulumi}new aws.ec2.SecurityGroupRule("out", { type: "egress", protocol: "-1", fromPort: 0, toPort: 0, cidrBlocks: ["0.0.0.0/0"] });`,
  ],
  invalid: [
    { code: `${cdk}sg.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(22), "ssh");`, errors: [{ messageId: "open", data: { ports: "port 22" } }] },
    { code: `${cdk}db.connections.allowFrom(ec2.Peer.anyIpv4(), ec2.Port.tcp(5432));`, errors: 1 },
    { code: `${cdk}sg.connections.allowFromAnyIpv4(ec2.Port.allTraffic());`, errors: [{ messageId: "open", data: { ports: "all ports" } }] },
    { code: `${pulumi}new aws.ec2.SecurityGroup("db", { ingress: [{ protocol: "tcp", fromPort: 3306, toPort: 3306, cidrBlocks: ["0.0.0.0/0"] }] });`, errors: [{ messageId: "open", data: { ports: "port 3306" } }] },
    { code: `${pulumi}new aws.ec2.SecurityGroupRule("in", { type: "ingress", protocol: "-1", fromPort: 0, toPort: 0, cidrBlocks: ["0.0.0.0/0"] });`, errors: 1 },
    { code: `${pulumi}new aws.vpc.SecurityGroupIngressRule("ssh", { cidrIpv4: "0.0.0.0/0", fromPort: 22, toPort: 22, ipProtocol: "tcp" });`, errors: 1 },
  ],
});

tester.run("no-public-database", rules["no-public-database"], {
  valid: [`${cdk}new rds.DatabaseInstance(this, "Db", { publiclyAccessible: false });`, "const row = { publiclyAccessible: true };"],
  invalid: [
    { code: `${cdk}new rds.DatabaseInstance(this, "Db", { engine, vpc, publiclyAccessible: true });`, errors: [{ messageId: "public" }] },
    { code: `${pulumi}new aws.rds.Instance("db", { publiclyAccessible: true });`, errors: 1 },
  ],
});
