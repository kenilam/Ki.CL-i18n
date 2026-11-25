# The dev server's port, from .env; whatever already holds it is stopped first.
DEV_PORT := $(or $(shell grep -E '^PORT=' .env 2>/dev/null | cut -d= -f2),3500)

build:
	@echo ⌛ building...
	yarn run build
	@echo done

install:
	@echo ⌛ installing...
	yarn
	@echo done

lint:
	@echo ⌛ linting...
	yarn run lint
	@echo done

run:
	@scripts/free-port.sh $(DEV_PORT)
	@echo ⌛ running development...
	yarn run development

run.production:
	@scripts/free-port.sh $(DEV_PORT)
	@echo ⌛ running production...
	yarn run production

run.server:
	@echo ⌛ running the server...
	yarn run server

start:
	@echo ⌛ starting...
	@test -f .env || cp .env.template .env
	yarn install
	@$(MAKE) run

typecheck:
	@echo ⌛ type checking...
	yarn run typecheck
	@echo done

types:
	@echo ⌛ fetching remote types...
	yarn run types
	@echo done

# A record for a local gateway's registry: `make registry.local DIR=../Ki.CL-api/.registry-local`.
registry.local:
	@mkdir -p $(DIR)/services
	@yarn run registry record http://localhost:3501/api > $(DIR)/services/i18n.json
	@echo "wrote $(DIR)/services/i18n.json"

# The site's words by hand, against MONGODB_DATABASE. A deployed repo sends its own English and the nightly run fills in the rest, so these are for local work and repairs.
#   make translations.seed DIR=../Ki.CL/App/locales
#   make translations.translate LANGUAGES="fr ja"
translations.seed:
	@yarn run translations seed "$(DIR)"

translations.diff:
	@yarn run translations diff "$(DIR)"

translations.prune:
	@yarn run translations prune "$(DIR)"

translations.drop:
	@yarn run translations drop "$(NAMESPACE)"

translations.translate:
	@yarn run translations translate $$LANGUAGES

translations.copy:
	@yarn run translations copy $$LANGUAGES

# The languages the site is translated into, one row of `locales` each. TAG and PROMPT reach the script through the environment, so nothing in them runs as shell.
#   make locales.add TAG=it-CH PROMPT="An optional note for the translation prompt."
locales.list:
	@yarn run locales list

locales.add:
	@yarn run locales add "$$TAG" "$$PROMPT"

locales.remove:
	@yarn run locales remove "$$TAG"
