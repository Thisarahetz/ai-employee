# Pinned Rasa Open Source (multi-arch: amd64 + arm64). The model is trained at
# build time so the container starts offline, with no external LLM or API key.
FROM rasa/rasa:3.6.21 AS trainer
USER root
WORKDIR /app
COPY config.yml domain.yml endpoints.yml ./
COPY data ./data
RUN rasa train nlu --fixed-model-name ai-employee-nlu --out /app/models

FROM rasa/rasa:3.6.21
USER root
WORKDIR /app
COPY --from=trainer /app/models /app/models
# Models can also be mounted/replaced at /app/models without rebuilding the image.
RUN chown -R 1001:1001 /app
USER 1001
ENTRYPOINT []
EXPOSE 5005
# RASA_AUTH_TOKEN is read from the environment (never baked into the image).
CMD ["sh", "-c", "exec rasa run --enable-api --model /app/models/ai-employee-nlu.tar.gz --port 5005 --auth-token \"$RASA_AUTH_TOKEN\""]
