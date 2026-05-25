# Validate forms with Zod schemas

The Tucker frontend will have several forms — entry logging, food creation,
profile setup, weight logging. They need consistent validation: required
fields, type checks, ranges, and clear error messages tied to the rule that
produced them. Validation should not be invented per form.

We considered Vuelidate, VeeValidate, Yup, hand-rolled validators, and Nuxt
UI's `validate` callback prop. Zod was chosen because it composes with
TypeScript's type system (input/output types are inferred from the schema —
no parallel TS interface to keep in sync), it works directly with `UForm`'s
`schema` prop via Nuxt UI's bundled adapter, and it is the standard JS/TS
choice for schema validation in 2026.

## Consequences

- Each form defines a Zod schema near the component and passes it to
  `<UForm :schema="schema" :state="state">`. No hand-rolled `validate`
  functions for rules a schema can express.
- Error messages live in the schema (`z.string().min(1, "Enter a label…")`),
  next to the rule they describe; they propagate to `UFormField` by field
  name automatically.
- The schema's inferred `z.infer<typeof schema>` is the canonical type for
  the form's state and emitted payload, keeping types and validation in
  lock-step.
- This rule applies to **form** validation. Runtime parsing of API responses
  is out of scope — those types come from the OpenAPI spec via
  `nuxt-open-fetch`.

## References

- <https://zod.dev>
- Nuxt UI Form schema validation: <https://ui.nuxt.com/components/form#schema>
