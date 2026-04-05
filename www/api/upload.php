<?php
declare(strict_types=1);

require_once __DIR__ . '/_common.php';

handle_api(function (): void {
    require_method('POST');

    if (!isset($_FILES['image']) || !is_array($_FILES['image'])) {
        abort_request(400, 'Veuillez joindre une image.');
    }

    $participantId = normalize_participant_id($_POST['participant_id'] ?? null);
    assert_participant_id($participantId);

    $name = normalize_text($_POST['name'] ?? null, true, 120);
    $description = normalize_text($_POST['description'] ?? null, true, 1800);
    $author = normalize_text($_POST['author'] ?? null, false, 120);

    $imageUpload = $_FILES['image'];
    $imageInfo = inspect_image_upload($imageUpload);

    $entry = with_mutation_lock(function () use ($participantId, $name, $description, $author, $imageUpload, $imageInfo): array {
        $index = read_index();

        foreach ($index as $existingEntry) {
            if (($existingEntry['participant_id'] ?? null) === $participantId) {
                abort_request(409, 'Ce code participant a deja ete utilise.');
            }
        }

        $itemId = create_unique_item_id($index);
        $directory = item_dir($itemId);
        $imagePath = $directory . '/' . $imageInfo['filename'];

        if (!mkdir($directory, 0775, false) && !is_dir($directory)) {
            throw new RuntimeException('Impossible de creer le dossier de l objet.');
        }

        $now = new DateTimeImmutable('now', new DateTimeZone('UTC'));
        $entry = [
            'id' => $itemId,
            'participant_id' => $participantId,
            'name' => $name,
            'description' => $description,
            'author' => $author,
            'created_at' => $now->format('Y-m-d'),
            'submitted_at' => $now->format(DateTimeInterface::ATOM),
            'has_model' => false,
            'image_filename' => $imageInfo['filename'],
            'image_mime' => $imageInfo['mime'],
            'model_filename' => null,
            'model_mime' => null,
        ];

        try {
            move_uploaded_file_to($imageUpload, $imagePath);
            write_item_meta($itemId, $entry);
            array_unshift($index, $entry);
            write_json_atomic(index_path(), $index);
            return $entry;
        } catch (Throwable $exception) {
            delete_tree($directory);
            throw $exception;
        }
    });

    json_response(201, [
        'item' => create_public_item($entry),
        'message' => 'Contribution enregistree.',
    ]);
});
