import fs from 'node:fs'

const KNOWN_TYPES = new Set([
  'array',
  'boolean',
  'https_url',
  'iso_datetime',
  'non_empty_string',
  'null',
  'number',
  'object',
  'positive_integer',
  'string',
])

function valueType(value) {
  if (value === null) return 'null'
  if (Array.isArray(value)) return 'array'
  return typeof value === 'object' ? 'object' : typeof value
}

function isIsoDatetime(value) {
  if (typeof value !== 'string' || !value.trim()) return false
  const parsed = Date.parse(value)
  return Number.isFinite(parsed) && /(?:Z|[+-]\d{2}:\d{2})$/.test(value)
}

function isHttpsUrl(value) {
  if (typeof value !== 'string') return false
  try {
    return new URL(value).protocol === 'https:'
  } catch {
    return false
  }
}

function matchesType(value, expected) {
  if (Array.isArray(expected)) return expected.some((candidate) => matchesType(value, candidate))
  if (!KNOWN_TYPES.has(expected)) throw new Error(`runtime_contract_unknown_type:${expected}`)
  if (expected === 'non_empty_string') return typeof value === 'string' && Boolean(value.trim())
  if (expected === 'iso_datetime') return isIsoDatetime(value)
  if (expected === 'https_url') return isHttpsUrl(value)
  if (expected === 'positive_integer') return Number.isInteger(value) && value > 0
  return valueType(value) === expected
}

function resolveReference(contract, reference) {
  if (typeof reference !== 'string' || !reference.startsWith('$')) {
    throw new Error(`runtime_contract_invalid_reference:${reference}`)
  }
  let current = contract
  for (const segment of reference.slice(1).split('.')) {
    current = current?.[segment]
  }
  if (!Array.isArray(current)) throw new Error(`runtime_contract_reference_not_array:${reference}`)
  return current
}

export function loadRuntimeContract(contractPath) {
  const contract = JSON.parse(fs.readFileSync(contractPath, 'utf8'))
  if (contract?.schema !== 'saturnws.desktop-control-plane.contract.v1' || contract?.contract_version !== 1) {
    throw new Error('runtime_contract_identity_invalid')
  }
  return contract
}

export function validateRuntimeOperation(contract, operationPath, payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new Error(`${operationPath}:response_not_object`)
  }
  const [owner, operationName] = String(operationPath).split('.')
  const operation = contract?.[owner]?.operations?.[operationName]
  if (!operation?.response) throw new Error(`${operationPath}:operation_not_found`)
  const { required = {}, fixed = {}, enums = {}, relations = [] } = operation.response
  for (const [field, expected] of Object.entries(required)) {
    if (!(field in payload)) throw new Error(`${operationPath}:missing:${field}`)
    if (!matchesType(payload[field], expected)) {
      throw new Error(`${operationPath}:invalid_type:${field}:${valueType(payload[field])}`)
    }
  }
  for (const [field, expected] of Object.entries(fixed)) {
    if (payload[field] !== expected) throw new Error(`${operationPath}:invalid_fixed_value:${field}`)
  }
  for (const [field, reference] of Object.entries(enums)) {
    if (!resolveReference(contract, reference).includes(payload[field])) {
      throw new Error(`${operationPath}:invalid_enum:${field}`)
    }
  }
  for (const relation of relations) {
    if (
      relation.kind === 'equals'
      && relation.left === 'allow'
      && relation.right_expression === "decision == 'allow'"
      && payload.allow !== (payload.decision === 'allow')
    ) {
      throw new Error(`${operationPath}:invalid_relation:allow_decision`)
    }
  }
  return payload
}
