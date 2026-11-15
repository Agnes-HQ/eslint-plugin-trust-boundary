import type { Rule } from "eslint";
import type * as ESTree from "estree";
import { calleeName, docsUrl, findProperty, isInfraFile, memberPath, propertyName, staticValue, type WithParent } from "../utils";

const WEB_PORTS = new Set([80, 443]);
const OPEN_CIDR = new Set(["0.0.0.0/0", "::/0"]);
const CIDR_KEYS = ["cidrBlocks", "ipv6CidrBlocks", "cidrIpv4", "cidrIpv6", "cidrIp", "sourceRanges"];

const isOpen = (value: unknown) => (typeof value === "string" && OPEN_CIDR.has(value)) || (Array.isArray(value) && value.some((v) => typeof v === "string" && OPEN_CIDR.has(v)));

/** The ports a CDK `Port` expression opens, as text for the message; undefined when it is only 80 or 443, or unknown. */
function cdkPort(node: ESTree.Node | undefined): string | undefined {
  if (!node || node.type !== "CallExpression") return undefined;
  const path = memberPath(node.callee) ?? "";
  if (!/(?:^|\.)Port\.\w+$/.test(path)) return undefined;
  const kind = path.split(".").at(-1);
  const args = node.arguments.map((a) => staticValue(a));
  if (kind === "allTraffic" || kind === "allTcp" || kind === "allUdp") return "all ports";
  if ((kind === "tcp" || kind === "udp") && typeof args[0] === "number") return WEB_PORTS.has(args[0]) ? undefined : `port ${args[0]}`;
  if ((kind === "tcpRange" || kind === "udpRange") && typeof args[0] === "number" && typeof args[1] === "number") return `ports ${args[0]}-${args[1]}`;
  return undefined;
}

function isCdkAnyPeer(node: ESTree.Node | undefined): boolean {
  if (!node || node.type !== "CallExpression") return false;
  const path = memberPath(node.callee) ?? "";
  if (/(?:^|\.)Peer\.any(?:Ipv4|Ipv6)$/.test(path)) return true;
  return /(?:^|\.)Peer\.ipv[46]$/.test(path) && isOpen(staticValue(node.arguments[0]));
}

/** Whether an object literal describes inbound traffic: inside `ingress: [...]`, `type: "ingress"`, or an *Ingress* resource. */
function isIngress(node: WithParent<ESTree.ObjectExpression>): boolean {
  const type = findProperty(node, "type");
  if (type && staticValue(type.value) === "ingress") return true;
  const direction = findProperty(node, "direction");
  if (direction && staticValue(direction.value) === "INGRESS") return true;
  const parent = node.parent;
  if (parent?.type === "ArrayExpression") {
    const prop = parent.parent;
    return prop?.type === "Property" && /^(?:ingress|securityGroupIngress)$/.test(propertyName(prop) ?? "");
  }
  if (parent && (parent.type === "NewExpression" || parent.type === "CallExpression")) return /Ingress/.test(calleeName(parent) ?? "");
  return false;
}

/** The ports an ingress object opens, for the message; undefined when only 80 or 443, or unknown. */
function objectPorts(node: ESTree.ObjectExpression): string | undefined {
  const protocol = ["protocol", "ipProtocol"].map((k) => findProperty(node, k)).find(Boolean);
  const proto = protocol ? staticValue(protocol.value) : undefined;
  if (proto === "-1" || proto === -1 || proto === "all") return "all ports";
  const from = staticValue(findProperty(node, "fromPort")?.value);
  const to = staticValue(findProperty(node, "toPort")?.value);
  if (typeof from !== "number" || typeof to !== "number") return undefined;
  if (from === to) return WEB_PORTS.has(from) ? undefined : `port ${from}`;
  return `ports ${from}-${to}`;
}

/** Inbound traffic from anywhere on the internet to a port other than HTTP and HTTPS: CDK security groups, Pulumi rules. */
const rule: Rule.RuleModule = {
  meta: {
    type: "problem",
    docs: { description: "Disallow ingress from anywhere on ports other than 80 and 443", url: docsUrl("no-open-ingress") },
    schema: [],
    messages: {
      open: "This allows inbound traffic from any address to {{ports}}, which is the whole internet once the resource has a public address. Limit the source to the addresses or security groups that need it.",
    },
  },
  create(context) {
    if (!isInfraFile(context)) return {};
    return {
      // CDK: sg.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(22)); sg.connections.allowFrom(Peer.anyIpv4(), Port.tcp(5432))
      CallExpression(node) {
        const name = calleeName(node);
        let ports: string | undefined;
        if ((name === "addIngressRule" || name === "allowFrom") && isCdkAnyPeer(node.arguments[0])) ports = cdkPort(node.arguments[1]);
        else if (name === "allowFromAnyIpv4") ports = cdkPort(node.arguments[0]);
        if (ports) context.report({ node, messageId: "open", data: { ports } });
      },
      // Pulumi: ingress: [{ protocol: "tcp", fromPort: 22, toPort: 22, cidrBlocks: ["0.0.0.0/0"] }]
      ObjectExpression(node: WithParent<ESTree.ObjectExpression>) {
        const open = CIDR_KEYS.some((k) => {
          const p = findProperty(node, k);
          return p && isOpen(staticValue(p.value));
        });
        if (!open || !isIngress(node)) return;
        const ports = objectPorts(node);
        if (ports) context.report({ node, messageId: "open", data: { ports } });
      },
    };
  },
};

export default rule;
