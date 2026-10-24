Feature: Who sees what
  People only see their own jobs and projects. A builder sees a client's own details only once the
  client has accepted their proposal or quote.

  Scenario: A builder sees a client's phone number only once they've agreed
    Given I am logged in as Marcus
    When I send a proposal:
      | Name            | Emma Clarke             |
      | Email           | emma.clarke@example.com |
      | Title           | Garden studio           |
      | What's included | A small garden studio.  |
      | Price           | 40,000                  |
    Then I see "Waiting for Emma Clarke to accept."
    And I don't see "(303) 555-0123"
    When Emma accepts the proposal "Garden studio"
    And I reload the page
    Then I see "(303) 555-0123"

  Scenario: Clients can't open other clients' jobs
    Given I am logged in as Noah
    When I go to "/jobs/2"
    Then I see "This job doesn't exist or isn't open any more."
    And I don't see "Main bathroom remodel"

  Scenario: Builders can't open jobs that have closed
    Given I am logged in as Grace
    When I go to "/jobs/1"
    Then I see "This job doesn't exist or isn't open any more."

  Scenario: Only the builder and client can open a project
    Given I am logged in as Noah
    When I go to "/projects/1"
    Then I see "This project doesn't exist."
